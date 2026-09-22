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
import { enforceLoginLimit } from "../lib/login-limit.ts";
import { durableMemory } from "../agent/lib/durable-memory.ts";

process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
assert.equal(verifyChatPassword("1010", "Riki"), true);
assert.equal(verifyChatPassword("wrong", "Riki"), false);
assert.equal(verifyChatPassword("1010", "other"), false);
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
assert.equal(verifyChatPassword("1010", "Riki"), false);
for (let i = 0; i < 10; i++) assert.equal(enforceLoginLimit(100000), 0);
assert.equal(enforceLoginLimit(100000), 60);
assert.equal(enforceLoginLimit(160001), 0);
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
