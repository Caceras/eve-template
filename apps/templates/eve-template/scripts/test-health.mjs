// /api/health is healthy (200, ok: true) only when the app can serve a chat:
// the eve runtime answers, sign-in is set up and the chat database answers a
// read. Otherwise it is 503 and names the failing part, while keeping the
// fields scripts/verify-live.mjs and CI's image job read.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
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
      // next/server has no exports map; the bundler resolves it, plain Node needs the file.
      if (specifier === "next/server") return next("next/server.js", context);
      throw error;
    }
  },
});

// A stand-in for the eve runtime's own health route on 127.0.0.1.
let eveStatus = 200;
const eve = createServer((request, response) => {
  response.statusCode = request.url === "/eve/v1/health" ? eveStatus : 404;
  response.end("{}");
});
await new Promise((resolve) => eve.listen(0, "127.0.0.1", resolve));

const directory = await mkdtemp(join(tmpdir(), "aegentica-health-"));
process.env.EVE_NEXT_PRODUCTION_PORT = String(eve.address().port);
process.env.EVE_SETTINGS_DIR = join(directory, "settings");
process.env.EVE_CHAT_DB_PATH = join(directory, "chats.sqlite");
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.EVE_CHAT_PASSWORD = randomBytes(24).toString("hex");
delete process.env.DATABASE_URL;
const { GET } = await import("../app/api/health/route.ts");
const release = readFileSync(join(root, "lib/release.ts"), "utf8").match(
  /export const RELEASE = "([^"]+)"/,
)?.[1];
const health = async () => {
  const response = await GET();
  return { status: response.status, body: await response.json() };
};
const errors = console.error;

try {
  // A chat database that cannot be read (here: not a database) fails health.
  await writeFile(process.env.EVE_CHAT_DB_PATH, "not a database ".repeat(100));
  console.error = () => {};
  let result = await health();
  console.error = errors;
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.database, "unavailable");
  assert.equal(result.body.eve, "ready");
  assert.equal(result.body.app, "ready");

  // Everything answers: healthy, with the fields verify-live and CI read.
  await rm(process.env.EVE_CHAT_DB_PATH);
  result = await health();
  assert.equal(result.status, 200);
  assert.deepEqual(
    { ...result.body, latencyMs: 0 },
    {
      ok: true,
      release,
      app: "ready",
      auth: "password",
      eve: "ready",
      database: "ready",
      latencyMs: 0,
      storage: "database",
    },
  );

  // eve down or failing.
  eveStatus = 503;
  result = await health();
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.eve, "unavailable");
  eveStatus = 200;

  // No session secret: nobody can sign in, so the app is not usable.
  delete process.env.EVE_SESSION_SECRET;
  result = await health();
  assert.equal(result.status, 503);
  assert.equal(result.body.ok, false);
  assert.equal(result.body.app, "setup-required");
  assert.equal(result.body.eve, "ready");

  console.log(
    "PASS: health is 503 when eve, sign-in setup or the chat database is unavailable, 200 with the fields verify-live reads",
  );
} finally {
  console.error = errors;
  eve.close();
  await rm(directory, { recursive: true, force: true });
}
