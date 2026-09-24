const MAX_BODY_BYTES = 8 * 1024 * 1024;

// The service worker handles shares from the installed app, including files.
// This answers only when it is not running yet: keep the text, drop the files.
export async function POST(request: Request) {
  const length = Number(request.headers.get("content-length"));
  const form =
    length > 0 && length <= MAX_BODY_BYTES ? await request.formData().catch(() => null) : null;
  const params = new URLSearchParams();
  for (const key of ["title", "text", "url"]) {
    const value = form?.get(key);
    if (typeof value === "string" && value.trim()) params.set(key, value.slice(0, 4000));
  }
  const query = params.toString();
  // A relative location stays on the public origin behind the reverse proxy.
  return new Response(null, { status: 303, headers: { Location: query ? `/?${query}` : "/" } });
}
