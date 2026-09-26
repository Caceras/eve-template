import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const PASSWORD_SESSION_COOKIE_NAME = "eve_chat_session";
export const PASSWORD_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
// v3 adds a random id, so two sign-ins in the same second get different
// tokens and signing out one never signs out the other; v2 stays valid until
// the cookies issued before it expire.
const TOKEN_VERSION = "v3";
const LEGACY_TOKEN_VERSION = "v2";
const TEMPORARY_USERNAME = "Riki";
const TEMPORARY_PASSWORD = "1010";
export const PASSWORD_RECORD_NAME = "operator-password.json";
/** Hashes of signed-out session tokens, each with its expiry (seconds). */
export const REVOKED_SESSIONS_NAME = "revoked-sessions.json";
/** Extra signing input that "Sign out everywhere" rotates while no password is saved. */
export const SESSION_NONCE_NAME = "session-nonce.json";
export type PasswordRecord = {
  version: 1;
  salt: string;
  digest: string;
  revision: string;
  changedAt: string;
};

export function operatorUsername() {
  return process.env.EVE_CHAT_USERNAME?.trim() || TEMPORARY_USERNAME;
}

export function getChatPassword() {
  return process.env.EVE_CHAT_PASSWORD?.trim() || TEMPORARY_PASSWORD;
}

/** Same path as secure-settings.settingsDirectory; also usable in standalone auth. */
function settingsFile(name: string) {
  const directory =
    process.env.EVE_SETTINGS_DIR ||
    join(
      process.env.EVE_MEMORY_DIR ? dirname(process.env.EVE_MEMORY_DIR) : ".eve/.workflow-data",
      "settings",
    );
  return join(directory, name);
}

export function readPasswordRecord(): PasswordRecord | undefined {
  const file = settingsFile(PASSWORD_RECORD_NAME);
  try {
    if (statSync(file).size > 2048) throw new Error("Invalid password settings.");
    const value = JSON.parse(readFileSync(file, "utf8")) as Partial<PasswordRecord>;
    if (
      value.version !== 1 ||
      typeof value.salt !== "string" ||
      !/^[a-f0-9]{32}$/.test(value.salt) ||
      typeof value.digest !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.digest) ||
      typeof value.revision !== "string" ||
      !/^[a-f0-9]{64}$/.test(value.revision) ||
      typeof value.changedAt !== "string" ||
      !Number.isFinite(Date.parse(value.changedAt))
    )
      throw new Error("Invalid password settings.");
    return value as PasswordRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

const cachedFiles = new Map<string, { version: string; value: unknown }>();

/**
 * A small settings file, parsed again only when it changed on disk: every
 * request checks it, and the other process (Next.js or eve) may rewrite it.
 */
function readCachedJson(name: string, maxBytes: number): unknown {
  const file = settingsFile(name);
  let info;
  try {
    info = statSync(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  if (info.size > maxBytes) throw new Error("Invalid session settings.");
  const version = `${info.ino}:${info.size}:${info.mtimeMs}`;
  const cached = cachedFiles.get(file);
  if (cached?.version === version) return cached.value;
  const value: unknown = JSON.parse(readFileSync(file, "utf8"));
  cachedFiles.set(file, { version, value });
  return value;
}

/** Signed-out tokens (`lib/password-sessions.ts` writes them): hash to expiry. */
export function readRevokedSessions(): Record<string, unknown> {
  const value = readCachedJson(REVOKED_SESSIONS_NAME, 256 * 1024);
  if (value === undefined) return {};
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid session settings.");
  return value as Record<string, unknown>;
}

function sessionNonce(): string | undefined {
  const value = readCachedJson(SESSION_NONCE_NAME, 1024) as
    | { version?: unknown; nonce?: unknown }
    | undefined;
  if (value === undefined) return undefined;
  if (
    value?.version !== 1 ||
    typeof value.nonce !== "string" ||
    !/^[a-f0-9]{64}$/.test(value.nonce)
  )
    throw new Error("Invalid session settings.");
  return value.nonce;
}

export const sessionTokenId = (token: string) => createHash("sha256").update(token).digest("hex");

export function passwordSettings() {
  const stored = readPasswordRecord();
  const environment = Boolean(process.env.EVE_CHAT_PASSWORD?.trim());
  return {
    username: operatorUsername(),
    source: stored ? "saved" : environment ? "environment" : "legacy",
    requiresChange: !stored && (!environment || getChatPassword().length < 16),
    changedAt: stored?.changedAt ?? null,
  };
}

export function isChatPasswordConfigured() {
  if (!process.env.EVE_SESSION_SECRET?.trim()) return false;
  try {
    return Boolean(readPasswordRecord() || getChatPassword());
  } catch {
    return false;
  }
}

function derivePassword(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password,
      Buffer.from(salt, "hex"),
      32,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, derived) => (error ? reject(error) : resolve(derived)),
    );
  });
}

export async function makePasswordRecord(password: string): Promise<PasswordRecord> {
  const salt = randomBytes(16).toString("hex");
  return {
    version: 1,
    salt,
    digest: (await derivePassword(password, salt)).toString("hex"),
    revision: randomBytes(32).toString("hex"),
    changedAt: new Date().toISOString(),
  };
}

export async function verifyChatPassword(candidate: string, username: string) {
  if (!isChatPasswordConfigured() || Buffer.byteLength(candidate) > 512) return false;
  if (!timingSafeEqual(hash(username), hash(passwordSettings().username))) return false;
  const stored = readPasswordRecord();
  return stored
    ? timingSafeEqual(
        await derivePassword(candidate, stored.salt),
        Buffer.from(stored.digest, "hex"),
      )
    : timingSafeEqual(hash(candidate), hash(getChatPassword()));
}

export function createPasswordSessionToken(now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + PASSWORD_SESSION_MAX_AGE;
  const payload = `${TOKEN_VERSION}.${expiresAt}.${randomBytes(12).toString("base64url")}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyPasswordSessionToken(token: string | undefined, now = Date.now()) {
  if (!token || !isChatPasswordConfigured()) return false;
  const parts = token.split(".");
  // v3.<expiry>.<id>.<signature>, or the older v2.<expiry>.<signature>.
  const legacy = parts[0] === LEGACY_TOKEN_VERSION && parts.length === 3;
  if (!legacy && !(parts[0] === TOKEN_VERSION && parts.length === 4)) return false;
  const signature = parts.at(-1)!;
  const expiresAt = Number(parts[1]);
  if (
    !signature ||
    (!legacy && !/^[\w-]{16}$/.test(parts[2]!)) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(now / 1000)
  )
    return false;
  const payload = parts.slice(0, -1).join(".");
  if (!timingSafeEqual(hash(signature), hash(sign(payload)))) return false;
  // A signed-out cookie stays refused even if someone copied it.
  return !Object.hasOwn(readRevokedSessions(), sessionTokenId(token));
}

/** A cookie's value as sent, verified or not. */
export function readCookie(headers: Headers, name: string) {
  const value = headers
    .get("cookie")
    ?.split(";")
    .map((cookie) => cookie.trim().split("="))
    .find(([key]) => key === name)?.[1];
  try {
    return value ? decodeURIComponent(value) : undefined;
  } catch {
    return undefined;
  }
}

export function getPasswordSessionFromHeaders(headers: Headers) {
  try {
    return verifyPasswordSessionToken(readCookie(headers, PASSWORD_SESSION_COOKIE_NAME));
  } catch {
    return false;
  }
}

export function hasSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  const publicHost = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !publicHost) return false;
  try {
    const originUrl = new URL(origin);
    const forwardedProtocol = request.headers.get("x-forwarded-proto");
    return (
      originUrl.host === publicHost &&
      (!forwardedProtocol || originUrl.protocol === `${forwardedProtocol}:`)
    );
  } catch {
    return false;
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest();
}

function sign(payload: string) {
  const key = process.env.EVE_SESSION_SECRET?.trim();
  if (!key) throw new Error("Session signing is not configured.");
  const stored = readPasswordRecord();
  const nonce = sessionNonce();
  // Revoke old cookies on password changes and Sign out everywhere without
  // orphaning encrypted API keys. Without a nonce the identity is as before,
  // so existing sessions stay valid.
  const identity = JSON.stringify([
    operatorUsername(),
    stored ? stored.revision + stored.digest : hash(getChatPassword()).toString("hex"),
    ...(nonce ? [nonce] : []),
  ]);
  return createHmac("sha256", key)
    .update(identity)
    .update("\0")
    .update(payload)
    .digest("base64url");
}
