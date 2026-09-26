import { createHmac, timingSafeEqual } from "node:crypto";
import { isIPv6 } from "node:net";

// One shared operator account and one replica, so the counters live in this
// process. Use shared storage before scaling replicas.
//
// Each client address (an IPv6 client's whole /64) gets ten failed attempts a
// minute, so one client guessing cannot lock the operator out from elsewhere.
// All attempts together are capped at 100 a minute, which bounds guessing
// (and password hashing) when an attacker rotates addresses. A browser that
// signed in before carries a signed known-device cookie and skips that
// overall cap, so an attacker who fills it cannot keep the operator out.
const WINDOW_MS = 60_000;
const CLIENT_FAILURES = 10;
const ALL_ATTEMPTS = 100;
const MAX_CLIENTS = 1_000;

type Window = { startedAt: number; count: number };
let everyone: Window = { startedAt: 0, count: 0 };
const clients = new Map<string, Window>();

/**
 * An IPv6 host usually holds a whole /64 and can pick any address in it, so
 * the network is the client. IPv4-mapped addresses count as IPv4.
 */
function clientBucket(address: string) {
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped) return mapped[1];
  if (!isIPv6(address)) return address;
  const [head, tail] = address.split("::");
  const groups = head ? head.split(":") : [];
  if (tail !== undefined) {
    const rest = tail ? tail.split(":") : [];
    // An embedded IPv4 tail takes two groups' room.
    const width = rest.reduce((sum, group) => sum + (group.includes(".") ? 2 : 1), 0);
    groups.push(...Array(8 - groups.length - width).fill("0"), ...rest);
  }
  return `${groups
    .slice(0, 4)
    .map((group) => parseInt(group, 16).toString(16))
    .join(":")}::/64`;
}

/**
 * The address the reverse proxy saw: the right-most `X-Forwarded-For` entry,
 * which the proxy sets itself, so a client cannot choose it. Without a proxy,
 * Next.js fills the header only when a client left it out, and the overall
 * cap bounds a client that rotates it. No header means one shared bucket.
 */
export function loginClient(headers: Headers) {
  const address = headers.get("x-forwarded-for")?.split(",").at(-1)?.trim();
  return address ? clientBucket(address.slice(0, 64)) : "unknown";
}

export const KNOWN_DEVICE_COOKIE_NAME = "aegentica_known_device";
export const KNOWN_DEVICE_MAX_AGE = 60 * 60 * 24 * 400;

function knownDeviceSignature(expiresAt: string) {
  const secret = process.env.EVE_SESSION_SECRET?.trim();
  if (!secret) return undefined;
  return createHmac("sha256", secret)
    .update("aegentica/known-device/v1\0" + expiresAt)
    .digest("base64url");
}

/** Set on a successful sign-in; proves only that this browser signed in before. */
export function knownDeviceToken(now = Date.now()) {
  const expiresAt = String(Math.floor(now / 1000) + KNOWN_DEVICE_MAX_AGE);
  const signature = knownDeviceSignature(expiresAt);
  return signature ? `v1.${expiresAt}.${signature}` : undefined;
}

export function isKnownDevice(token: string | undefined, now = Date.now()) {
  const [version, expiresAt, signature, ...extra] = token?.split(".") ?? [];
  if (version !== "v1" || !expiresAt || !signature || extra.length > 0) return false;
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) <= Math.floor(now / 1000)) return false;
  const expected = knownDeviceSignature(expiresAt);
  return (
    expected !== undefined &&
    signature.length === expected.length &&
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
  );
}

const secondsLeft = (window: Window, now: number) =>
  Math.max(1, Math.ceil((WINDOW_MS - (now - window.startedAt)) / 1000));

function clientWindow(client: string, now: number) {
  const current = clients.get(client);
  if (current && now - current.startedAt < WINDOW_MS) return current;
  clients.delete(client);
  if (clients.size >= MAX_CLIENTS) {
    for (const [key, window] of clients)
      if (now - window.startedAt >= WINDOW_MS) clients.delete(key);
    // Still full within one minute: forget the oldest; the overall cap still applies.
    for (const key of clients.keys()) {
      if (clients.size < MAX_CLIENTS) break;
      clients.delete(key);
    }
  }
  const fresh = { startedAt: now, count: 0 };
  clients.set(client, fresh);
  return fresh;
}

/**
 * Counts one sign-in attempt from `client` and returns 0, or the seconds to
 * wait. The attempt counts as failed until `loginSucceeded` refunds it, so
 * parallel guesses are counted before their passwords are checked. A known
 * device keeps its client limit but is outside the overall cap.
 */
export function enforceLoginLimit(client: string, now = Date.now(), knownDevice = false): number {
  if (now - everyone.startedAt >= WINDOW_MS) everyone = { startedAt: now, count: 0 };
  const window = clientWindow(client, now);
  if (window.count >= CLIENT_FAILURES) return secondsLeft(window, now);
  if (!knownDevice && everyone.count >= ALL_ATTEMPTS) return secondsLeft(everyone, now);
  window.count += 1;
  if (!knownDevice) everyone.count += 1;
  return 0;
}

/** A correct password does not count toward the client's failed attempts. */
export function loginSucceeded(client: string) {
  const window = clients.get(client);
  if (window && window.count > 0) window.count -= 1;
}
