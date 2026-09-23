import { getPasswordSessionFromHeaders, hasSameOriginRequest } from "./password-auth";

let windowStart = 0;
let attempts = 0;

export const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function readBody(request: Request, maxBytes: number) {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        return "too-large" as const;
      }
      chunks.push(value);
    }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Shared guard for operator settings APIs: password-operator session, then
 * for writes same-origin, a per-process rate limit and a 16 KB JSON body (task prompts are up to 4,000
 * characters).
 */
export async function handleOperatorSettings(
  request: Request,
  handlers: {
    read: () => Promise<Response>;
    maxBytes?: number;
    write: (body: Record<string, unknown>, request: Request) => Promise<Response>;
  },
) {
  if (!getPasswordSessionFromHeaders(request.headers))
    return json({ error: "Sign in as the operator to change settings." }, 401);
  try {
    if (request.method === "GET") return await handlers.read();
    if (!hasSameOriginRequest(request)) return json({ error: "Invalid request origin." }, 403);
    if (Date.now() - windowStart > 60_000) {
      windowStart = Date.now();
      attempts = 0;
    }
    if (++attempts > 30) return json({ error: "Too many requests. Try again in a minute." }, 429);
    const body = await readBody(request, Math.min(65_536, handlers.maxBytes ?? 16_384));
    if (body === "too-large") return json({ error: "Request too large." }, 413);
    if (!body) return json({ error: "Invalid request." }, 400);
    return await handlers.write(body, request);
  } catch {
    return json(
      { error: "Could not complete the request. Try again or check your server configuration." },
      503,
    );
  }
}
