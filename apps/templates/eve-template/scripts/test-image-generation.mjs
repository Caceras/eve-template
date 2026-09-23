// generate_image end to end with a stubbed provider: request shape, saved file,
// operator-only media route, and the model-facing summary. Needs Node 24.
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
const directory = await mkdtemp(join(tmpdir(), "aegentica-images-"));
process.env.EVE_SETTINGS_DIR = join(directory, "settings");
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const requests = [];
globalThis.fetch = async (url, init) => {
  requests.push({
    url: String(url),
    body: JSON.parse(init.body),
    auth: new Headers(init.headers).get("authorization"),
  });
  return Response.json({ data: [{ b64_json: PNG.toString("base64") }] });
};

const settings = await import("../lib/provider-settings.ts");
const { default: tool } = await import("../agent/tools/generate_image.ts");
const { GET } = await import("../app/api/media/[name]/route.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");

try {
  await settings.saveProviderKey("openrouter", "sk-or-v1-test");
  await settings.setActiveProvider("openrouter");
  const output = await tool.execute({ prompt: "A watercolor hummingbird", aspectRatio: "3:2" }, {});
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://openrouter.ai/api/v1/images");
  assert.equal(requests[0].auth, "Bearer sk-or-v1-test");
  assert.equal(requests[0].body.model, "openai/gpt-image-1-mini");
  assert.equal(requests[0].body.aspect_ratio, "3:2");
  assert.equal(output.images.length, 1);
  const { url, alt } = output.images[0];
  assert.match(url, /^\/api\/media\/[0-9a-f-]{36}\.png$/);
  assert.equal(alt, "A watercolor hummingbird");
  assert.match(tool.toModelOutput(output).value, /already shows them/);

  const name = url.split("/").pop();
  const get = (file, cookie) =>
    GET(new Request(`https://app.test/api/media/${file}`, { headers: cookie ? { cookie } : {} }), {
      params: Promise.resolve({ name: file }),
    });
  assert.equal((await get(name)).status, 401, "signed-out requests are refused");
  const cookie = `eve_chat_session=${createPasswordSessionToken()}`;
  const response = await get(name, cookie);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), PNG);
  assert.equal((await get("../settings/openrouter.enc", cookie)).status, 404, "no path traversal");

  await settings.setActiveProvider("gateway");
  await assert.rejects(
    tool.execute({ prompt: "x y z", aspectRatio: "1:1" }, {}),
    /No Vercel AI Gateway API key/,
  );
  console.log(
    "PASS: generate_image via the active provider (request shape, key, aspect ratio), saved to the volume, operator-only media route without traversal, model summary, missing-key error",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
