// proxy.ts: the Telegram and Slack webhooks turn away requests without their
// signature header (401) or over 1 MB (413) before eve reads them, and the
// scheduled-task header never passes through the public app to eve.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^(\.\.?\/|file:)/.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      // next/server has no exports map; the bundler resolves it, plain Node needs the file.
      if (specifier === "next/server") return next("next/server.js", context);
      throw error;
    }
  },
});
const { NextRequest } = await import("next/server");
const { proxy, config } = await import("../proxy.ts");
const { INTERNAL_HEADER } = await import("../lib/internal-auth.ts");
const post = (path, headers = {}) =>
  proxy(
    new NextRequest("https://aegentica.se" + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: "{}",
    }),
  );
const passes = (response) => response.headers.get("x-middleware-next") === "1";

for (const [path, header] of [
  ["/eve/v1/telegram", "x-telegram-bot-api-secret-token"],
  ["/eve/v1/slack", "x-slack-signature"],
]) {
  assert.equal(post(path).status, 401, `${path} without ${header}`);
  assert.equal(
    post(path, { [header]: "s", "content-length": String(2 * 1024 * 1024) }).status,
    413,
  );
  assert(passes(post(path, { [header]: "s", "content-length": "2" })), `${path} signed`);
}

// A forged scheduled-task header is dropped; everything else goes through unchanged.
const forged = post("/eve/v1/session", { [INTERNAL_HEADER]: "guess", cookie: "a=b" });
assert(passes(forged));
const kept = forged.headers.get("x-middleware-override-headers").split(",");
assert.equal(kept.includes(INTERNAL_HEADER), false);
assert(kept.includes("cookie"));
assert.equal(forged.headers.get(`x-middleware-request-${INTERNAL_HEADER}`), null);
assert.equal(post("/eve/v1/session").headers.get("x-middleware-override-headers"), null);

// Matchers are build-time literals: only the webhooks, and eve requests carrying the header.
assert.deepEqual(config.matcher, [
  "/eve/v1/telegram",
  "/eve/v1/slack",
  { source: "/eve/:path*", has: [{ type: "header", key: INTERNAL_HEADER }] },
]);
console.log(
  "PASS: webhooks without their signature header get 401, over 1 MB 413; the internal header never reaches eve through the app",
);
