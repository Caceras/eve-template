// Large JSON answers (a long chat, the model catalog) are gzipped at the
// origin for clients that accept it; small ones and other clients get plain
// JSON, and the route's own headers survive either way.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = fileURLToPath(new URL("..", import.meta.url));
const { acceptsGzip, jsonResponse } = await import("../lib/http/json.ts");

assert.equal(acceptsGzip("gzip, deflate, br, zstd"), true);
assert.equal(acceptsGzip("br;q=1.0, GZIP;q=0.5"), true);
assert.equal(acceptsGzip("*"), true);
assert.equal(acceptsGzip("x-gzip"), true);
assert.equal(acceptsGzip("gzip;q=0"), false);
assert.equal(acceptsGzip("gzip;q=0, *"), false, "an explicit refusal wins over *");
assert.equal(acceptsGzip("br, identity"), false);
assert.equal(acceptsGzip(""), false);
assert.equal(acceptsGzip(null), false);

const request = (acceptEncoding) =>
  new Request("https://app.test/api/chats/1", {
    headers: acceptEncoding ? { "accept-encoding": acceptEncoding } : {},
  });
const chat = {
  chat: {
    id: "1",
    events: Array.from({ length: 400 }, (_, index) => ({ type: "text", data: `Line ${index}` })),
  },
};

// A long chat, compressed, with the route's cache and status headers kept.
const big = await jsonResponse(request("gzip, deflate, br"), chat, {
  status: 201,
  headers: { "Cache-Control": "no-store" },
});
assert.equal(big.status, 201);
assert.equal(big.headers.get("content-encoding"), "gzip");
assert.equal(big.headers.get("content-type"), "application/json");
assert.equal(big.headers.get("cache-control"), "no-store");
assert.match(big.headers.get("vary"), /Accept-Encoding/);
const bytes = Buffer.from(await big.arrayBuffer());
assert.equal(Number(big.headers.get("content-length")), bytes.byteLength);
const plainSize = JSON.stringify(chat).length;
assert(bytes.byteLength < plainSize / 5, `gzip shrinks it (${bytes.byteLength} of ${plainSize})`);
assert.deepEqual(JSON.parse(gunzipSync(bytes).toString("utf8")), chat);

// Clients that do not accept gzip, and small answers, get plain JSON.
for (const response of [
  await jsonResponse(request(), chat),
  await jsonResponse(request("gzip;q=0"), chat),
  await jsonResponse(request("gzip"), { chats: [], nextCursor: null }),
]) {
  assert.equal(response.headers.get("content-encoding"), null);
  assert.match(response.headers.get("vary"), /Accept-Encoding/);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.ok(await response.json());
}

// The heavy routes use it.
for (const route of [
  "app/api/chats/route.ts",
  "app/api/chats/[id]/route.ts",
  "app/api/models/route.ts",
])
  assert.match(readFileSync(join(root, route), "utf8"), /return jsonResponse\(request, /, route);

console.log(
  "PASS: JSON compression: gzip over 1 KB when accepted (q=0 respected), plain otherwise, route headers kept, chats and models routes compressed",
);
