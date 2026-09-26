import { createHash } from "node:crypto";
import { readMedia, statMedia } from "@/lib/media-store";
import { getPasswordSessionFromHeaders } from "@/lib/password-auth";

// A generated picture never changes under its random name, so the browser may
// keep it; `no-cache` still asks this route (and its sign-in check) before every
// use, and an unchanged picture costs a 304 instead of a download.
function notModified(headers: Headers, etag: string, modified: number) {
  const tags = headers.get("if-none-match");
  if (tags !== null)
    return tags
      .split(",")
      .map((tag) => tag.trim().replace(/^W\//, ""))
      .some((tag) => tag === "*" || tag === etag);
  const since = Date.parse(headers.get("if-modified-since") ?? "");
  return Number.isFinite(since) && Math.floor(modified / 1000) * 1000 <= since;
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!getPasswordSessionFromHeaders(request.headers))
    return new Response("Sign in to view this file.", { status: 401 });
  const { name } = await params;
  const info = await statMedia(name);
  if (!info) return new Response("Not found.", { status: 404 });
  const etag = `"${createHash("sha256").update(`${name}:${info.bytes}:${info.modified}`).digest("base64url").slice(0, 32)}"`;
  const headers = {
    // Private media is re-authorized on every use, including after sign-out.
    "Cache-Control": "private, no-cache",
    ETag: etag,
    "Last-Modified": new Date(info.modified).toUTCString(),
    "X-Content-Type-Options": "nosniff",
  };
  if (notModified(request.headers, etag, info.modified))
    return new Response(null, { status: 304, headers });
  const media = await readMedia(name);
  if (!media) return new Response("Not found.", { status: 404 });
  return new Response(new Uint8Array(media.data), {
    headers: { ...headers, "Content-Type": media.mediaType },
  });
}
