// JSON answers of route handlers leave the origin uncompressed (Next.js
// compresses pages, not these bodies), and some are large: a long chat is
// hundreds of kilobytes that gzip shrinks about twenty times, and the model
// catalog is fetched on every start. This gzips a body over 1 KB for clients
// that accept it, keeping every header the route sets.

const MIN_BYTES = 1024;

/** Whether an Accept-Encoding header allows gzip (explicitly, or through `*`), honouring q=0. */
export function acceptsGzip(header: string | null) {
  if (!header) return false;
  const weights = new Map<string, number>();
  for (const part of header.split(",")) {
    const [coding = "", ...parameters] = part.split(";").map((piece) => piece.trim());
    const q = parameters.find((parameter) => /^q=/i.test(parameter));
    const weight = q ? Number(q.slice(2)) : 1;
    if (coding) weights.set(coding.toLowerCase(), Number.isFinite(weight) ? weight : 0);
  }
  const gzip = weights.get("gzip") ?? weights.get("x-gzip") ?? weights.get("*");
  return gzip !== undefined && gzip > 0;
}

/** `Response.json`, gzipped when the body is large enough and the client accepts it. */
export async function jsonResponse(request: Request, data: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  // Caches must keep compressed and plain answers apart.
  headers.append("vary", "Accept-Encoding");
  const body = new TextEncoder().encode(JSON.stringify(data));
  if (body.byteLength < MIN_BYTES || !acceptsGzip(request.headers.get("accept-encoding")))
    return new Response(body, { ...init, headers });
  const compressed = await new Response(
    new Blob([body]).stream().pipeThrough(new CompressionStream("gzip")),
  ).arrayBuffer();
  headers.set("content-encoding", "gzip");
  headers.set("content-length", String(compressed.byteLength));
  return new Response(compressed, { ...init, headers });
}
