import { randomBytes } from "node:crypto";
import {
  PASSWORD_RECORD_NAME,
  readPasswordRecord,
  readRevokedSessions,
  REVOKED_SESSIONS_NAME,
  SESSION_NONCE_NAME,
  sessionTokenId,
  verifyPasswordSessionToken,
} from "./password-auth";
import { withSettingsLock, writeJson } from "./secure-settings";

// A 30-day token is recorded once per sign-out; far more than one operator needs.
const MAX_REVOKED_SESSIONS = 2000;

/**
 * Signing out ends that session on the server too: the token's hash is kept
 * until it would have expired. Only a valid token is recorded, so nobody
 * without a session can grow the list.
 */
export async function revokePasswordSessionToken(token: string | undefined, now = Date.now()) {
  if (!token || !verifyPasswordSessionToken(token, now)) return false;
  const expiresAt = Number(token.split(".")[1]);
  await withSettingsLock("revoked-sessions", async () => {
    const current = Math.floor(now / 1000);
    const kept = Object.entries(readRevokedSessions()).filter(
      ([, expiry]) => typeof expiry === "number" && expiry > current,
    );
    kept.push([sessionTokenId(token), expiresAt]);
    await writeJson(REVOKED_SESSIONS_NAME, Object.fromEntries(kept.slice(-MAX_REVOKED_SESSIONS)));
  });
  return true;
}

/**
 * Sign out everywhere: every existing session cookie stops verifying. A saved
 * password gets a new revision (part of the signing identity); an environment
 * password gets a new signing nonce instead. Data and keys are untouched.
 */
export async function rotatePasswordSessions() {
  await withSettingsLock("operator-password", async () => {
    const stored = readPasswordRecord();
    const fresh = randomBytes(32).toString("hex");
    if (stored) await writeJson(PASSWORD_RECORD_NAME, { ...stored, revision: fresh });
    else await writeJson(SESSION_NONCE_NAME, { version: 1, nonce: fresh });
  });
}
