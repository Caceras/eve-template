import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Credential for server-internal calls to the eve HTTP API (scheduled tasks
 * run through the same session API as the web app). Derived from
 * EVE_SESSION_SECRET, so it never leaves the server and needs no setup.
 */
export const INTERNAL_HEADER = "x-aegentica-internal";

export function internalToken() {
  const secret = process.env.EVE_SESSION_SECRET?.trim();
  if (!secret) throw new Error("EVE_SESSION_SECRET is required for scheduled tasks.");
  return createHmac("sha256", secret).update("aegentica/internal/v1").digest("hex");
}

export function isInternalRequest(headers: Headers) {
  const presented = headers.get(INTERNAL_HEADER);
  if (!presented || !process.env.EVE_SESSION_SECRET?.trim()) return false;
  const expected = internalToken();
  return (
    presented.length === expected.length &&
    timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
  );
}
