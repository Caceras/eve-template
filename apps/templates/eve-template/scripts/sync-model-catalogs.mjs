// Refreshes the offline fallback used when a provider's model catalog is unreachable.
import { writeFile } from "node:fs/promises";
import { normalizeCatalog } from "../lib/model-catalog.ts";

const sources = {
  gateway: "https://ai-gateway.vercel.sh/v1/models",
  openrouter: "https://openrouter.ai/api/v1/models",
};
const snapshot = { updatedAt: new Date().toISOString().slice(0, 10) };
for (const [provider, url] of Object.entries(sources)) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${provider} catalog returned HTTP ${response.status}`);
  snapshot[provider] = normalizeCatalog(provider, (await response.json()).data).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  console.log(`${provider}: ${snapshot[provider].length} tool-capable models`);
}
const lines = Object.entries(snapshot).map(([key, value]) =>
  Array.isArray(value)
    ? `  ${JSON.stringify(key)}: [\n${value.map((model) => `    ${JSON.stringify(model)}`).join(",\n")}\n  ]`
    : `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
);
await writeFile(
  new URL("../lib/model-catalogs.snapshot.json", import.meta.url),
  `{\n${lines.join(",\n")}\n}\n`,
);
