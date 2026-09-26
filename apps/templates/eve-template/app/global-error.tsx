"use client";

import { useEffect, useState } from "react";
import { isVersionSkewError, requestReload } from "@/lib/pwa/version-recovery";

// Replaces the root layout when even that fails, so it cannot count on the
// app's stylesheet or fonts (after a deploy they may be gone). It keeps the
// look of app/_components/error-state.tsx and public/offline.html inline.
const styles = `
:root {
  color-scheme: light dark;
  --bg: oklch(1 0 0);
  --fg: oklch(0.16 0 0);
  --muted: oklch(0.49 0 0);
  --button: oklch(0.19 0 0);
  --button-fg: oklch(0.985 0 0);
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: oklch(0.145 0 0);
    --fg: oklch(0.985 0 0);
    --muted: oklch(0.708 0 0);
    --button: oklch(0.922 0 0);
    --button-fg: oklch(0.205 0 0);
  }
}
html { height: 100%; background: var(--bg); }
body {
  position: fixed;
  inset: 0;
  overflow-y: auto;
  margin: 0;
  padding: 16px;
  display: grid;
  place-items: center;
  background: var(--bg);
  color: var(--fg);
  font: 14px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  -webkit-font-smoothing: antialiased;
}
main { display: flex; flex-direction: column; align-items: center; text-align: center; }
svg { width: 44px; height: 44px; margin-bottom: 20px; }
h1 { margin: 0; font-size: 24px; line-height: 32px; font-weight: 500; letter-spacing: -0.025em; }
p { margin: 6px 0 0; max-width: 24rem; color: var(--muted); line-height: 24px; }
button {
  margin-top: 24px;
  min-height: 44px;
  padding: 0 16px;
  border: 0;
  border-radius: 8px;
  background: var(--button);
  color: var(--button-fg);
  font: inherit;
  font-weight: 500;
  cursor: pointer;
}
button:focus-visible { outline: 2px solid var(--muted); outline-offset: 2px; }
small { display: block; margin-top: 16px; font-size: 12px; color: var(--muted); }
`;

export default function GlobalError({
  error,
}: {
  readonly error: Error & { readonly digest?: string };
}) {
  const updated = isVersionSkewError(error);
  const [reloading, setReloading] = useState(false);
  useEffect(() => {
    if (updated) setReloading(requestReload("error"));
  }, [updated]);
  return (
    <html lang="en">
      <head>
        <meta content="width=device-width, initial-scale=1, viewport-fit=cover" name="viewport" />
        <title>Ægentica</title>
        <style dangerouslySetInnerHTML={{ __html: styles }} />
      </head>
      <body>
        <main>
          {/* The Æ mark from public/aegentica.svg, in the text colour. */}
          <svg aria-label="Ægentica" role="img" viewBox="0 0 1254 1254">
            <path
              d="M278 810 L357 811 L489 642 L601 642 L602 811 L956 811 L956 758 L665 757 L666 642 L956 642 L956 589 L532 588 L627 467 L956 467 L956 416 L585 416 Z"
              fill="currentColor"
            />
          </svg>
          <h1>{updated ? "Ægentica was updated" : "Something went wrong"}</h1>
          <p role="status">
            {updated
              ? reloading
                ? "Loading the new version…"
                : "Reload to continue with the new version."
              : "Ægentica could not be shown. Your conversations are safe on your server."}
          </p>
          <button onClick={() => window.location.reload()} type="button">
            Reload
          </button>
          {error.digest ? <small>Reference {error.digest}</small> : null}
        </main>
      </body>
    </html>
  );
}
