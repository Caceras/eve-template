import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import {
  createPasswordSessionToken,
  verifyPasswordSessionToken,
  verifyChatPassword,
  getPasswordSessionFromHeaders,
} from "../lib/password-auth.ts";
import {
  enforceLoginLimit,
  isKnownDevice,
  knownDeviceToken,
  loginClient,
  loginSucceeded,
} from "../lib/login-limit.ts";
import { durableMemory } from "../agent/lib/durable-memory.ts";

// These assertions cover the built-in defaults, so ignore credentials set in the shell.
delete process.env.EVE_CHAT_USERNAME;
delete process.env.EVE_CHAT_PASSWORD;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
assert.equal(await verifyChatPassword("1010", "Riki"), true);
assert.equal(await verifyChatPassword("wrong", "Riki"), false);
assert.equal(await verifyChatPassword("1010", "other"), false);
const token = createPasswordSessionToken();
assert.equal(verifyPasswordSessionToken(token), true);
assert.equal(verifyPasswordSessionToken(token + "x"), false);
assert.equal(verifyPasswordSessionToken(token, Date.now() + 31 * 86400000), false);
assert.equal(
  getPasswordSessionFromHeaders(new Headers({ cookie: "eve_chat_session=%invalid" })),
  false,
);
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
assert.equal(verifyPasswordSessionToken(token), false);
delete process.env.EVE_SESSION_SECRET;
assert.equal(verifyPasswordSessionToken(token), false);
assert.equal(await verifyChatPassword("1010", "Riki"), false);
// Ten failed attempts per client address a minute; the right-most forwarded entry is the client.
const guesser = loginClient(new Headers({ "x-forwarded-for": "203.0.113.9, 198.51.100.7" }));
assert.equal(guesser, "198.51.100.7");
assert.equal(loginClient(new Headers()), "unknown");
for (let i = 0; i < 10; i++) assert.equal(enforceLoginLimit(guesser, 100000), 0);
assert.equal(enforceLoginLimit(guesser, 100000), 60);
assert.equal(enforceLoginLimit(guesser, 130000), 30);
// One client hammering does not block another, and successful sign-ins do not count.
for (let i = 0; i < 20; i++) {
  assert.equal(enforceLoginLimit("203.0.113.1", 130000), 0, "another client still signs in");
  loginSucceeded("203.0.113.1");
}
assert.equal(enforceLoginLimit(guesser, 160001), 0);
// 100 attempts a minute across all addresses bound guessing from rotating addresses.
for (let i = 0; i < 100; i++) assert.equal(enforceLoginLimit(`192.0.2.${i}`, 300000), 0);
assert.equal(enforceLoginLimit("192.0.2.200", 300000), 60);
// A browser that signed in before is outside that cap (its own client limit still holds).
assert.equal(enforceLoginLimit("192.0.2.201", 300000, true), 0);
assert.equal(enforceLoginLimit("192.0.2.200", 360000), 0);
// An IPv6 client is its /64: every address in it shares one bucket.
const v6 = (address) => loginClient(new Headers({ "x-forwarded-for": address }));
assert.equal(v6("2001:db8:1:2::1"), "2001:db8:1:2::/64");
assert.equal(v6("2001:0DB8:0001:0002:ffff:0:0:9"), "2001:db8:1:2::/64");
assert.equal(v6("2001:db8::7"), "2001:db8:0:0::/64");
assert.equal(v6("::ffff:198.51.100.4"), "198.51.100.4");
assert.notEqual(v6("2001:db8:1:3::1"), v6("2001:db8:1:2::1"));
assert.equal(v6("not-an-address"), "not-an-address");
// The known-device cookie is signed with the session secret and expires.
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
const device = knownDeviceToken(500000);
assert.equal(isKnownDevice(device, 500000), true);
assert.equal(isKnownDevice(device.slice(0, -2) + "xx", 500000), false);
assert.equal(isKnownDevice(device, 500000 + 401 * 86400000), false);
assert.equal(isKnownDevice(undefined), false);
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
assert.equal(isKnownDevice(device, 500000), false, "a new secret forgets every device");
delete process.env.EVE_SESSION_SECRET;
assert.equal(knownDeviceToken(), undefined);
console.log(
  "PASS: credentials, tampering, expiry, secret rotation, malformed cookies, fail-closed auth and login limits",
);

const directory = await mkdtemp(join(tmpdir(), "aegentica-memory-"));
const signal = new AbortController().signal;
try {
  const first = durableMemory(directory);
  const otherProcess = durableMemory(directory);
  assert.equal(await first.read({ key: "riki", signal }), null);
  const created = await first.write({
    key: "riki",
    content: "Prefers Swedish",
    expectedVersion: null,
    signal,
  });
  assert.deepEqual(await otherProcess.read({ key: "riki", signal }), created);
  await assert.rejects(
    otherProcess.write({ key: "riki", content: "stale", expectedVersion: null, signal }),
  );
  const changed = await otherProcess.write({
    key: "riki",
    content: "Prefers concise Swedish",
    expectedVersion: created.version,
    signal,
  });
  assert.deepEqual(await first.read({ key: "riki", signal }), changed);
  assert.equal(await first.read({ key: "different-principal", signal }), null);
  console.log(
    "PASS: durable memory, independent connections, optimistic write conflicts and scope isolation",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
