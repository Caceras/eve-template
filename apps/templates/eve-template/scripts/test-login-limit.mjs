// The sign-in route through its public API: one address guessing is stopped
// without locking the operator out from another address.
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
      // next/server has no exports map; the bundler resolves it, plain Node needs the file.
      if (specifier === "next/server") return next("next/server.js", context);
      throw error;
    }
  },
});
const directory = await mkdtemp(join(tmpdir(), "aegentica-login-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.EVE_CHAT_USERNAME = "Test operator";
process.env.EVE_CHAT_PASSWORD = randomBytes(24).toString("hex");
const { POST } = await import("../app/api/password-auth/login/route.ts");
const origin = "https://fixture.test";
// Traefik appends the address it saw, so anything a client sends stays to its left.
const signIn = (address, password, forged = "203.0.113.1", cookie = "") =>
  POST(
    new Request(origin + "/api/password-auth/login", {
      method: "POST",
      headers: {
        host: "fixture.test",
        origin,
        "content-type": "application/json",
        "x-forwarded-for": `${forged}, ${address}`,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify({ username: "Test operator", password }),
    }),
  );
try {
  const guesser = "198.51.100.7";
  for (let i = 0; i < 10; i++) assert.equal((await signIn(guesser, "wrong")).status, 401);
  const blocked = await signIn(guesser, process.env.EVE_CHAT_PASSWORD);
  assert.equal(blocked.status, 429);
  assert.match(blocked.headers.get("retry-after"), /^\d+$/);
  const operator = await signIn("203.0.113.1", process.env.EVE_CHAT_PASSWORD, guesser);
  assert.equal(operator.status, 200, "the operator signs in while another address is blocked");
  assert.match(operator.headers.get("set-cookie"), /eve_chat_session=/);
  for (let i = 0; i < 12; i++)
    assert.equal((await signIn("203.0.113.1", process.env.EVE_CHAT_PASSWORD)).status, 200);

  // A sign-in leaves a signed known-device cookie, sent only to this route.
  const deviceCookie = operator.headers
    .getSetCookie()
    .find((item) => item.startsWith("aegentica_known_device="));
  assert.match(deviceCookie, /HttpOnly/i);
  assert.match(deviceCookie, /Path=\/api\/password-auth\/login/);
  assert.match(deviceCookie, /SameSite=lax/i);
  assert.match(deviceCookie, /Max-Age=\d{8}/);
  const device = deviceCookie.split(";")[0];

  // An IPv6 guesser cannot escape its limit by moving around its /64.
  for (let i = 1; i <= 10; i++)
    assert.equal((await signIn(`2001:db8:5:6::${i}`, "wrong")).status, 401);
  assert.equal((await signIn("2001:db8:5:6:ffff::1", "wrong")).status, 429);
  assert.equal(
    (await signIn("2001:db8:5:7::1", "wrong")).status,
    401,
    "another /64 is another client",
  );

  // Rotating addresses fills the overall cap: a new browser waits, a known one does not.
  for (let i = 0; i < 100; i++) await signIn(`198.18.${Math.floor(i / 10)}.${i % 10}`, "wrong");
  assert.equal((await signIn("192.0.2.50", process.env.EVE_CHAT_PASSWORD)).status, 429);
  assert.equal(
    (
      await signIn(
        "192.0.2.50",
        process.env.EVE_CHAT_PASSWORD,
        undefined,
        "aegentica_known_device=v1.9999999999.forged",
      )
    ).status,
    429,
    "a forged device cookie does not help",
  );
  assert.equal(
    (await signIn("192.0.2.50", process.env.EVE_CHAT_PASSWORD, undefined, device)).status,
    200,
    "the operator's browser still signs in",
  );
  console.log(
    "PASS: sign-in limit per client address (IPv6 per /64), forged forwarded entries ignored, other clients and successful sign-ins unaffected, a known device passes a full overall cap",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
