import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const PASSWORD_SESSION_COOKIE_NAME = "eve_chat_session";
export const PASSWORD_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

const TOKEN_VERSION = "v1";
const TEMPORARY_USERNAME = "Riki";
const TEMPORARY_PASSWORD = "1010";

export function getChatPassword() {
  return process.env.EVE_CHAT_PASSWORD?.trim() || TEMPORARY_PASSWORD;
}

export function isChatPasswordConfigured() {
  return Boolean(getChatPassword()) && Boolean(process.env.EVE_SESSION_SECRET?.trim());
}

export function verifyChatPassword(candidate: string, username: string) {
  return (
    isChatPasswordConfigured() &&
    timingSafeEqual(
      hash(username),
      hash(process.env.EVE_CHAT_USERNAME?.trim() || TEMPORARY_USERNAME),
    ) &&
    timingSafeEqual(hash(candidate), hash(getChatPassword()))
  );
}

export function createPasswordSessionToken(now = Date.now()) {
  const expiresAt = Math.floor(now / 1000) + PASSWORD_SESSION_MAX_AGE;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  const signature = sign(payload);

  return `${payload}.${signature}`;
}

export function verifyPasswordSessionToken(token: string | undefined, now = Date.now()) {
  if (!token || !isChatPasswordConfigured()) {
    return false;
  }

  const [version, expiresAtRaw, signature, ...extra] = token.split(".");
  const expiresAt = Number(expiresAtRaw);

  if (
    version !== TOKEN_VERSION ||
    !signature ||
    extra.length > 0 ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= Math.floor(now / 1000)
  ) {
    return false;
  }

  const expected = sign(`${version}.${expiresAt}`);

  return timingSafeEqual(hash(signature), hash(expected));
}

export function getPasswordSessionFromHeaders(headers: Headers) {
  const cookieHeader = headers.get("cookie");

  if (!cookieHeader) {
    return false;
  }

  const token = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim().split("="))
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

  if (!origin || !publicHost) {
    return false;
  }

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
  return createHmac("sha256", key).update(payload).digest("base64url");
}
