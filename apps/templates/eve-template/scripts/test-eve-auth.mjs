// Who the eve session API accepts: the operator's cookie only from this app's
// own pages for writes (another site's form post carries the cookie too),
// scheduled tasks by their internal token, and Vercel OIDC only on Vercel.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
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
      throw error;
    }
  },
});
const directory = await mkdtemp(join(tmpdir(), "aegentica-eve-auth-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.EVE_CHAT_PASSWORD = randomBytes(24).toString("hex");
delete process.env.VERCEL;
const { passwordEveAuth, internalEveAuth } = await import("../lib/eve-auth.ts");
const channel = (await import("../agent/channels/eve.ts")).default;
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");
const { INTERNAL_HEADER, internalToken } = await import("../lib/internal-auth.ts");
const cookie = `eve_chat_session=${createPasswordSessionToken()}`;
// As eve sees it behind Next's /eve proxy: Host is eve's own, x-forwarded-host the public one.
const call = (method, headers = {}) =>
  new Request("http://127.0.0.1:4274/eve/v1/session", {
    method,
    headers: {
      host: "127.0.0.1:4274",
      "x-forwarded-host": "aegentica.se",
      "x-forwarded-proto": "https",
      cookie,
      ...headers,
    },
    ...(method === "GET" || method === "HEAD" ? {} : { body: "{}" }),
  });
try {
  const operator = await passwordEveAuth(call("POST", { origin: "https://aegentica.se" }));
  assert.equal(operator?.principalId, "eve-chat-user", "a same-origin write is the operator");
  for (const origin of ["https://evil.example", "http://aegentica.se", "null"])
    assert.equal(await passwordEveAuth(call("POST", { origin })), null, `${origin} is refused`);
  assert.equal(await passwordEveAuth(call("POST")), null, "a write without Origin is refused");
  assert.equal(await passwordEveAuth(call("DELETE", { origin: "https://evil.example" })), null);
  assert.equal((await passwordEveAuth(call("GET")))?.principalId, "eve-chat-user", "reads");
  assert.equal(
    await passwordEveAuth(call("POST", { origin: "https://aegentica.se", cookie: "" })),
    null,
  );
  // Scheduled tasks call eve directly with the internal token and no Origin.
  const internal = new Request("http://127.0.0.1:4274/eve/v1/session", {
    method: "POST",
    headers: { [INTERNAL_HEADER]: internalToken() },
    body: "{}",
  });
  assert.equal((await internalEveAuth(internal))?.principalId, "eve-chat-user");

  // Self-hosted, a bearer token shaped like a Vercel OIDC JWT is just refused:
  // eve's vercelOidc() (on Vercel only) would fetch the issuer's discovery document.
  const fetched = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url) => (
    fetched.push(String(url)),
    new Response("{}", { status: 404 })
  );
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const forged = [
    part({ alg: "RS256", kid: "k" }),
    part({
      iss: "https://oidc.vercel.com/attacker",
      aud: "https://vercel.com/attacker",
      sub: "owner:a:project:b:environment:production",
      exp: Math.floor(Date.now() / 1000) + 600,
    }),
    "c2ln",
  ].join(".");
  try {
    const info = channel.routes.find((route) => route.path === "/eve/v1/info");
    const response = await info.handler(
      new Request("http://127.0.0.1:4274/eve/v1/info", {
        headers: { authorization: `Bearer ${forged}` },
      }),
    );
    assert.equal(response.status, 401);
    assert.deepEqual(fetched, [], "no outbound OIDC discovery");
  } finally {
    globalThis.fetch = realFetch;
  }
  console.log(
    "PASS: eve session API writes need the app's own origin with the cookie; reads and the internal token unchanged; no Vercel OIDC lookups when self-hosted",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
