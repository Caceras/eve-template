const MAX_BODY_BYTES = 8 * 1024 * 1024;
// A longer address risks the server's header limit (HTTP 431), which would lose the share.
const MAX_SHARE_QUERY = 2000;

// The service worker handles shares from the installed app, including files.
// This answers only when it is not running yet: keep the text, drop the files.
export async function POST(request: Request) {
  // The share sheet opens this as the user's own navigation (Sec-Fetch-Site:
  // none); another site's form must not be able to fill the new-chat draft.
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return new Response("Shares from other sites are not accepted.", { status: 403 });
  const length = Number(request.headers.get("content-length"));
  const form =
    length > 0 && length <= MAX_BODY_BYTES ? await request.formData().catch(() => null) : null;
  const params = new URLSearchParams();
  for (const key of ["title", "text", "url"]) {
    const value = form?.get(key);
    if (typeof value === "string" && value.trim()) params.set(key, value);
  }
  const query = params.toString();
  if (query.length > MAX_SHARE_QUERY) return handOverShare(params);
  // A relative location stays on the public origin behind the reverse proxy.
  return new Response(null, { status: 303, headers: { Location: query ? `/?${query}` : "/" } });
}

// Same as public/sw.js: a page that leaves the shared text where the home page
// restores drafts from (eve-chat-draft), joined as the home page joins it.
function handOverShare(params: URLSearchParams) {
  const text = [...new Set(["title", "text", "url"].map((key) => params.get(key)?.trim()))]
    .filter(Boolean)
    .join("\n\n");
  // An escaped "<" cannot close the script element.
  const value = JSON.stringify(text).replaceAll("<", "\\u003c");
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark"><title>Ægentica</title><script>try{sessionStorage.setItem("eve-chat-draft",${value})}catch{}location.replace("/")</script>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}
