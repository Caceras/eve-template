import snapshot from "./model-catalogs.snapshot.json" with { type: "json" };
import { normalizeCatalog, type CatalogModel, type ProviderId } from "./model-catalog";

export type Catalog = {
  provider: ProviderId;
  models: CatalogModel[];
  source: "live" | "cached" | "snapshot";
  updatedAt: string;
};

const CATALOG_URLS: Record<ProviderId, string> = {
  gateway: "https://ai-gateway.vercel.sh/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
};
const MAX_CATALOG_BYTES = 8_000_000;
const MAX_CATALOG_MODELS = 5_000;
const state = new Map<
  ProviderId,
  { catalog?: Catalog; expiresAt: number; pending?: Promise<Catalog> }
>();

async function readBoundedJson(response: Response) {
  if (!response.ok || !response.body) throw new Error("Catalog unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_CATALOG_BYTES) {
      await reader.cancel();
      throw new Error("Catalog too large");
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function fetchCatalog(provider: ProviderId): Promise<Catalog> {
  const entry = state.get(provider)!;
  try {
    const body = await readBoundedJson(
      await fetch(CATALOG_URLS[provider], {
        signal: AbortSignal.timeout(8_000),
        redirect: "error",
        cache: "no-store",
      }),
    );
    if (!Array.isArray(body?.data) || body.data.length > MAX_CATALOG_MODELS)
      throw new Error("Invalid catalog");
    const models = normalizeCatalog(provider, body.data);
    if (models.length === 0) throw new Error("Empty catalog");
    entry.catalog = { provider, models, source: "live", updatedAt: new Date().toISOString() };
    entry.expiresAt = Date.now() + 5 * 60_000;
  } catch {
    entry.catalog = entry.catalog
      ? { ...entry.catalog, source: "cached" }
      : {
          provider,
          models: snapshot[provider],
          source: "snapshot",
          updatedAt: snapshot.updatedAt,
        };
    entry.expiresAt = Date.now() + 30_000;
  }
  return entry.catalog;
}

/**
 * The provider's live tool-capable models, cached for five minutes with a
 * bundled fallback. Once a catalog is known, an expired one is served while it
 * refreshes in the background, so a model step never waits on the catalog.
 */
export async function getCatalog(provider: ProviderId): Promise<Catalog> {
  let entry = state.get(provider);
  if (!entry) state.set(provider, (entry = { expiresAt: 0 }));
  if (entry.catalog && Date.now() < entry.expiresAt) return entry.catalog;
  entry.pending ??= fetchCatalog(provider).finally(() => {
    entry.pending = undefined;
  });
  return entry.catalog ?? entry.pending;
}
