import { readMedia } from "@/lib/media-store";
import { getPasswordSessionFromHeaders } from "@/lib/password-auth";

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  if (!getPasswordSessionFromHeaders(request.headers))
    return new Response("Sign in to view this file.", { status: 401 });
  const media = await readMedia((await params).name);
  if (!media) return new Response("Not found.", { status: 404 });
  return new Response(new Uint8Array(media.data), {
    headers: {
      "Content-Type": media.mediaType,
      // Names are random and never reused, so the file never changes.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
