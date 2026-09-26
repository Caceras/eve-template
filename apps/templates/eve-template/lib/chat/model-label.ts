import { isProviderId, PROVIDERS, type ProviderId } from "../model-catalog";

// The composer's model name must be right on the first frame, before the
// catalog loads. Each device remembers the last name it showed in a cookie,
// which the server renders and the loading skeleton reads before paint.
export const MODEL_LABEL_COOKIE = "aegentica-model";

export type ModelLabel = {
  readonly label: string;
  readonly provider: ProviderId;
  /** The maker's logo key (lib/brands.ts), when it has one. */
  readonly brand?: string;
};

const BRAND_KEY = /^[a-z0-9-]{1,40}$/;

export function parseModelLabel(value: string | undefined): ModelLabel | null {
  if (!value) return null;
  try {
    const [label, provider, brand] = JSON.parse(decodeURIComponent(value)) as unknown[];
    if (typeof label !== "string" || label.length > 120 || !isProviderId(provider)) return null;
    return typeof brand === "string" && BRAND_KEY.test(brand)
      ? { label, provider, brand }
      : { label, provider };
  } catch {
    return null;
  }
}

export function rememberModelLabel({ label, provider, brand }: ModelLabel) {
  const value = encodeURIComponent(
    JSON.stringify(brand ? [label, provider, brand] : [label, provider]),
  );
  document.cookie = `${MODEL_LABEL_COOKIE}=${value}; Path=/; Max-Age=31536000; SameSite=Lax`;
}

const SHORT_LABELS = Object.fromEntries(
  Object.entries(PROVIDERS).map(([id, provider]) => [id, provider.shortLabel]),
);

/**
 * Inline script for server-rendered placeholders, placed right after the
 * `[data-model-label]` element: fills it, its `[data-model-provider]` sibling
 * and the maker's logo in `[data-model-brand]` before paint.
 */
export const MODEL_LABEL_SCRIPT = `try{var s=document.currentScript,m=document.cookie.match(/(?:^|; )${MODEL_LABEL_COOKIE}=([^;]*)/),v=m&&JSON.parse(decodeURIComponent(m[1])),p=${JSON.stringify(SHORT_LABELS)};if(v&&typeof v[0]==="string"){s.previousElementSibling.textContent=v[0];var t=s.parentElement.querySelector("[data-model-provider]");if(t&&p[v[1]])t.textContent=p[v[1]];var b=s.parentElement.querySelector("[data-model-brand]");if(b&&/^[a-z0-9-]{1,40}$/.test(v[2]||"")){b.style.setProperty("--brand","url(/brands/"+v[2]+".svg)");b.hidden=false}}}catch(e){}`;
