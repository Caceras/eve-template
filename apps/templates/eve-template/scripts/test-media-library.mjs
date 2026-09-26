import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
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
const mediaDirectory = join(directory, "media");
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
  // Kept by the browser but revalidated (and re-authorized) on every use.
  assert.equal(imageResponse.headers.get("cache-control"), "private, no-cache");
  const etag = imageResponse.headers.get("etag");
  assert.match(etag, /^"[\w-]{32}"$/, "a strong ETag");
  const lastModified = imageResponse.headers.get("last-modified");
  assert(Number.isFinite(Date.parse(lastModified)));
  const fetchImage = (headers, withCookie = true) =>
    GET(
      new Request(`https://app.test/api/media/${saved.name}`, {
        headers: { ...(withCookie ? { cookie } : {}), ...headers },
      }),
      { params: Promise.resolve({ name: saved.name }) },
    );
  const unchanged = await fetchImage({ "if-none-match": etag });
  assert.equal(unchanged.status, 304);
  assert.equal((await unchanged.arrayBuffer()).byteLength, 0);
  assert.equal(unchanged.headers.get("etag"), etag);
  assert.equal(unchanged.headers.get("cache-control"), "private, no-cache");
  assert.equal((await fetchImage({ "if-none-match": `"other", W/${etag}` })).status, 304);
  assert.equal((await fetchImage({ "if-none-match": '"other"' })).status, 200);
  assert.equal((await fetchImage({ "if-modified-since": lastModified })).status, 304);
  const earlier = new Date(Date.parse(lastModified) - 5000).toUTCString();
  assert.equal((await fetchImage({ "if-modified-since": earlier })).status, 200);
  assert.equal(
    (await fetchImage({ "if-none-match": '"other"', "if-modified-since": lastModified })).status,
    200,
    "If-None-Match wins over If-Modified-Since",
  );
  assert.equal(
    (await fetchImage({ "if-none-match": etag }, false)).status,
    401,
    "signed out, even a cached picture is refused",
  );
  assert.equal(
    (await call({ action: "delete", name: saved.name }, { origin: "https://other.test" })).status,
    403,
  );
  assert.equal((await call({ action: "delete", name: "../../settings/secret" })).status, 400);
  assert.equal((await call(undefined, { query: "?offset=-1" })).status, 400);
  assert.equal((await call(undefined, { query: "?offset=Infinity" })).status, 400);
  // Distinct past times, a second apart, keep the expected order independent of clock granularity.
  const age = async (name, secondsAgo) => {
    const time = new Date(Date.now() - secondsAgo * 1000);
    await utimes(join(mediaDirectory, name), time, time);
  };
  await age(saved.name, 100);
  const touched = await fetchImage({ "if-none-match": etag });
  assert.equal(touched.status, 200, "a rewritten file is sent again");
  assert.notEqual(touched.headers.get("etag"), etag);
  for (let i = 0; i < 49; i++)
    await age((await media.saveMedia(new Uint8Array([i]), "image/png")).name, 99 - i);
  const page = await media.listMedia();
  assert.equal(page.images.length, 48);
  assert.equal(page.images.at(-1).createdAt < page.images[0].createdAt, true, "newest first");
  assert.equal(page.next, 2, "next counts the images older than the page");
  // An image made while paging goes to the front and does not repeat an item on later pages.
  const made = await media.saveMedia(new Uint8Array([99]), "image/png");
  const rest = await media.listMedia(page.next);
  assert.equal(rest.images.length, 2);
  assert.equal(rest.next, null);
  const paged = [...page.images, ...rest.images].map((image) => image.name);
  assert.equal(new Set(paged).size, 50);
  assert.equal(paged.includes(made.name), false);
  assert.equal(paged.at(-1), saved.name, "the oldest image is last");
  assert.equal((await media.listMedia()).images[0].name, made.name);
  assert.equal((await call({ action: "delete", name: saved.name })).status, 200);
  assert.equal(await media.readMedia(saved.name), undefined);
  assert.equal(
    (await media.listMedia()).images.some((image) => image.name === saved.name),
    false,
  );
  // Past 1,000 images the gallery still starts with the newest, whatever the directory order.
  for (let i = 0; i < 1000; i++) {
    const name = `${randomUUID()}.png`;
    await writeFile(join(mediaDirectory, name), new Uint8Array([i % 256]));
    await age(name, 1000 + i);
  }
  let offset = 0;
  const all = [];
  do {
    const listing = await media.listMedia(offset);
    assert.equal(listing.truncated, true);
    assert(listing.images.length <= 48);
    all.push(...listing.images.map((image) => image.name));
    offset = listing.next;
  } while (offset !== null);
  assert.equal(all.length, 1000);
  assert.equal(new Set(all).size, 1000);
  assert.equal(all[0], made.name);
  assert.deepEqual(all.slice(1, 50).sort(), paged.filter((name) => name !== saved.name).sort());
  console.log(
    "PASS: authenticated image library, metadata and legacy images, newest 1,000 first, stable pagination while images are made, CSRF and traversal rejection, private media revalidated with ETag and Last-Modified (304) and refused when signed out, confirmed deletion",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
