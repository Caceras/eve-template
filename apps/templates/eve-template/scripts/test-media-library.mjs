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
const directory = await mkdtemp(join(tmpdir(), "aegentica-media-"));
process.env.EVE_SETTINGS_DIR = join(directory, "settings");
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
const media = await import("../lib/media-store.ts");
const { handleMediaLibrary } = await import("../lib/media-library-handler.ts");
const { GET } = await import("../app/api/media/[name]/route.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");
const cookie = `eve_chat_session=${createPasswordSessionToken()}`;
const call = (body, options = {}) =>
  handleMediaLibrary(
    new Request(`https://app.test/api/images${options.query ?? ""}`, {
      method: body ? "POST" : "GET",
      headers: {
        host: "app.test",
        origin: options.origin ?? "https://app.test",
        "content-type": "application/json",
        ...(options.anonymous ? {} : { cookie }),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
try {
  assert.equal((await call(undefined, { anonymous: true })).status, 401);
  assert.deepEqual((await (await call()).json()).images, []);
  const saved = await media.saveMedia(new Uint8Array([1, 2, 3]), "image/png", {
    prompt: "Test prompt",
    model: "test/model",
  });
  const first = await (await call()).json();
  assert.equal(first.images[0].prompt, "Test prompt");
  assert.equal(first.images[0].model, "test/model");
  const imageResponse = await GET(
    new Request(`https://app.test/api/media/${saved.name}`, { headers: { cookie } }),
    { params: Promise.resolve({ name: saved.name }) },
  );
  assert.equal(imageResponse.status, 200);
  assert.match(imageResponse.headers.get("cache-control"), /no-store/);
  assert.equal(
    (await call({ action: "delete", name: saved.name }, { origin: "https://other.test" })).status,
    403,
  );
  assert.equal((await call({ action: "delete", name: "../../settings/secret" })).status, 400);
  assert.equal((await call(undefined, { query: "?offset=-1" })).status, 400);
  assert.equal((await call(undefined, { query: "?offset=Infinity" })).status, 400);
  for (let i = 0; i < 49; i++) await media.saveMedia(new Uint8Array([i]), "image/png");
  const page = await media.listMedia();
  assert.equal(page.images.length, 48);
  assert.equal(page.next, 48);
  const rest = await media.listMedia(page.next);
  assert.equal(rest.images.length, 2);
  assert.equal(rest.next, null);
  assert.equal(new Set([...page.images, ...rest.images].map((image) => image.name)).size, 50);
  assert.equal((await call({ action: "delete", name: saved.name })).status, 200);
  assert.equal(await media.readMedia(saved.name), undefined);
  assert.equal(
    (await media.listMedia()).images.some((image) => image.name === saved.name),
    false,
  );
  console.log(
    "PASS: authenticated image library, metadata and legacy images, deterministic pagination, CSRF and traversal rejection, private no-store media, confirmed deletion",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
