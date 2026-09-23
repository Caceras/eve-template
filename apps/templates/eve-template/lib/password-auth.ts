import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

export const PASSWORD_SESSION_COOKIE_NAME = "eve_chat_session";
export const PASSWORD_SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const TOKEN_VERSION = "v2";
const TEMPORARY_USERNAME = "Riki";
const TEMPORARY_PASSWORD = "1010";
export const PASSWORD_RECORD_NAME = "operator-password.json";
export type PasswordRecord = {
  version: 1;
  salt: string;
  digest: string;
  revision: string;
  changedAt: string;
};

export function getChatPassword() {
  return process.env.EVE_CHAT_PASSWORD?.trim() || TEMPORARY_PASSWORD;
}

/** Same path as secure-settings.settingsDirectory; also usable in standalone auth. */
function readPasswordRecord(): PasswordRecord | undefined {
  const directory = process.env.EVE_SETTINGS_DIR || join(
    process.env.EVE_MEMORY_DIR ? dirname(process.env.EVE_MEMORY_DIR) : ".eve/.workflow-data",
    "settings",
  );
  const file = join(directory, PASSWORD_RECORD_NAME);
  try {
    if (statSync(file).size > 2048) throw new Error("Invalid password settings.");
    const value = JSON.parse(readFileSync(file, "utf8")) as Partial<PasswordRecord>;
    if (value.version !== 1 || typeof value.salt !== "string" || !/^[a-f0-9]{32}$/.test(value.salt)
      || typeof value.digest !== "string" || !/^[a-f0-9]{64}$/.test(value.digest)
      || typeof value.revision !== "string" || !/^[a-f0-9]{64}$/.test(value.revision)
      || typeof value.changedAt !== "string" || !Number.isFinite(Date.parse(value.changedAt)))
      throw new Error("Invalid password settings.");
    return value as PasswordRecord;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function passwordSettings() {
  const stored = readPasswordRecord();
  const environment = Boolean(process.env.EVE_CHAT_PASSWORD?.trim());
  return {
    username: process.env.EVE_CHAT_USERNAME?.trim() || TEMPORARY_USERNAME,
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
    scrypt(password, Buffer.from(salt, "hex"), 32,
      { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 },
      (error, derived) => error ? reject(error) : resolve(derived));
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
    ? timingSafeEqual(await derivePassword(candidate, stored.salt), Buffer.from(stored.digest, "hex"))
    : timingSafeEqual(hash(candidate), hash(getChatPassword()));
}

export function createPasswordSessionToken(now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + PASSWORD_SESSION_MAX_AGE;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyPasswordSessionToken(token: string | undefined, now = Date.now()) {
  if (!token || !isChatPasswordConfigured()) return false;
  const [version, expiresAtRaw, signature, ...extra] = token.split(".");
  const expiresAt = Number(expiresAtRaw);
  if (version !== TOKEN_VERSION || !signature || extra.length > 0
    || !Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(now / 1000)) return false;
  return timingSafeEqual(hash(signature), hash(sign(`${version}.${expiresAt}`)));
}

export function getPasswordSessionFromHeaders(headers: Headers) {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) return false;
  const token = cookieHeader.split(";").map((cookie) => cookie.trim().split("="))
    .find(([name]) => name === PASSWORD_SESSION_COOKIE_NAME)?.[1];
  try {
    return verifyPasswordSessionToken(token ? decodeURIComponent(token) : undefined);
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
    return originUrl.host === publicHost
      && (!forwardedProtocol || originUrl.protocol === `${forwardedProtocol}:`);
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
  // Revoke old cookies on password changes without orphaning encrypted API keys.
  const identity = JSON.stringify([
    process.env.EVE_CHAT_USERNAME?.trim() || TEMPORARY_USERNAME,
    stored ? stored.revision + stored.digest : hash(getChatPassword()).toString("hex"),
  ]);
  return createHmac("sha256", key).update(identity).update("\0").update(payload).digest("base64url");
}
