// The /share fallback (before the service worker runs) takes shares from the
// device's share sheet, never a form on another site.
import assert from "node:assert/strict";

const { POST } = await import("../app/share/route.ts");
const form = new FormData();
form.set("text", "Injected draft");
const encoded = new Response(form);
const body = await encoded.arrayBuffer();
const share = (site) =>
  POST(
    new Request("https://aegentica.se/share", {
      method: "POST",
      headers: {
        "content-type": encoded.headers.get("content-type"),
        "content-length": String(body.byteLength),
        ...(site ? { "sec-fetch-site": site } : {}),
      },
      body,
    }),
  );

assert.equal((await share("cross-site")).status, 403, "another site's form is refused");
for (const site of ["none", "same-origin", "same-site", undefined]) {
  const accepted = await share(site);
  assert.equal(accepted.status, 303, `Sec-Fetch-Site: ${site}`);
  assert.equal(accepted.headers.get("location"), "/?text=Injected+draft");
}
console.log(
  "PASS: /share refuses cross-site posts and keeps share-sheet, same-site and header-less posts",
);
