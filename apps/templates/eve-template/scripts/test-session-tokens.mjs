// Session cookies carry a random id (v3), so two sign-ins in the same second
// never share a token, while cookies from before v3 (v2) keep working until
// they expire, so a deploy signs nobody out.
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = await mkdtemp(join(tmpdir(), "aegentica-tokens-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.EVE_CHAT_USERNAME = "Test operator";
process.env.EVE_CHAT_PASSWORD = randomBytes(24).toString("hex");
const auth = await import("../lib/password-auth.ts");

try {
  const now = Date.now();
  const first = auth.createPasswordSessionToken(now);
  const second = auth.createPasswordSessionToken(now);
  assert.notEqual(first, second, "same second, different tokens");
  assert.match(first, /^v3\.\d+\.[\w-]{16}\.[\w-]+$/);
  assert.equal(auth.verifyPasswordSessionToken(first), true);
  assert.equal(auth.verifyPasswordSessionToken(second), true);

  // A v2 cookie as the previous release signed it (no saved password, no nonce).
  const expiresAt = Math.floor(now / 1000) + 3600;
  const identity = JSON.stringify([
    process.env.EVE_CHAT_USERNAME,
    createHash("sha256").update(process.env.EVE_CHAT_PASSWORD).digest("hex"),
  ]);
  const legacyPayload = `v2.${expiresAt}`;
  const legacy = `${legacyPayload}.${createHmac("sha256", process.env.EVE_SESSION_SECRET)
    .update(identity)
    .update("\0")
    .update(legacyPayload)
    .digest("base64url")}`;
  assert.equal(auth.verifyPasswordSessionToken(legacy), true, "v2 cookies still sign in");

  // Tampered and malformed tokens fail.
  const [version, expiry, id, signature] = first.split(".");
  const refused = [
    `${version}.${expiry}.${"A".repeat(16)}.${signature}`, // another id
    `${version}.${Number(expiry) + 60}.${id}.${signature}`, // a later expiry
    `v2.${expiry}.${id}.${signature}`, // v2 with an id
    `${version}.${expiry}.${signature}`, // v3 without its id
    `${version}.${expiry}.${id}.${signature}.x`,
    `${version}.${expiry}.short.${signature}`,
    `v4.${expiry}.${id}.${signature}`,
  ];
  for (const token of refused) assert.equal(auth.verifyPasswordSessionToken(token), false, token);
  assert.equal(auth.verifyPasswordSessionToken(first, (Number(expiry) + 1) * 1000), false);
  console.log("PASS: unique session tokens per sign-in; v2 cookies still valid; tampering refused");
} finally {
  await rm(directory, { recursive: true, force: true });
}
