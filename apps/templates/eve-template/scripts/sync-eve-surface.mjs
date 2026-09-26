import { cpSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Describe what the app actually runs: the installed eve package, and the live
// registry `eve add` installs from. The monorepo copies can lag both.
const REGISTRY_URL = "https://eve.dev/r/registry.json";
// eve.dev serves this file from the eve repository; use it when eve.dev is unreachable.
const REGISTRY_SOURCE_URL =
  "https://raw.githubusercontent.com/vercel/eve/main/apps/docs/registry.json";
const templateRoot = resolve(process.cwd());
const evePackage = JSON.parse(
  readFileSync(join(templateRoot, "node_modules/eve/package.json"), "utf8"),
);
async function readRegistry() {
  const failures = [];
  for (const url of [REGISTRY_URL, REGISTRY_SOURCE_URL]) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
      if (response.ok) return await response.json();
      failures.push(`${url}: HTTP ${response.status}`);
    } catch (error) {
      failures.push(`${url}: ${error instanceof Error ? error.message : error}`);
    }
  }
  throw new Error(`Could not read the eve registry (${failures.join("; ")})`);
}
const registry = await readRegistry();

const items = (registry.items ?? []).map((item) => ({
  name: item.name,
  title: item.title ?? item.name,
  description: item.description ?? "",
  category: String(item.name).split("/")[0],
  implementation: item.meta?.eve?.implementation ?? null,
  requires: item.meta?.eve?.requires ?? null,
  docs: item.meta?.eve?.docs ?? null,
}));

const snapshot = {
  eveVersion: evePackage.version,
  packageExports: Object.keys(evePackage.exports ?? {}).sort(),
  registryItems: items.sort((a, b) => a.name.localeCompare(b.name)),
};

writeFileSync(
  join(templateRoot, "lib/eve-surface.generated.ts"),
  `// Generated from the installed eve package and ${REGISTRY_URL}. Do not edit by hand.\nexport const eveSurface = ${JSON.stringify(snapshot, null, 2)} as const;\n`,
);
console.log(
  `Synced eve ${snapshot.eveVersion}: ${snapshot.packageExports.length} public exports, ${snapshot.registryItems.length} registry items.`,
);

// Mirror the installed package's documentation into the app's reference tree.
const docsSource = join(templateRoot, "node_modules/eve/docs");
const docsTarget = join(templateRoot, "public/reference");
for (const entry of readdirSync(docsTarget)) {
  if (!["LICENSE.txt", "NOTICE.txt"].includes(entry))
    rmSync(join(docsTarget, entry), { recursive: true });
}
cpSync(docsSource, docsTarget, {
  recursive: true,
  filter: (source) => !source.endsWith("meta.json"),
});
const documents = readdirSync(docsTarget, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
  .map((entry) => "/reference/" + relative(docsTarget, join(entry.parentPath, entry.name)))
  .sort();
writeFileSync(
  join(docsTarget, "index.json"),
  JSON.stringify(
    { version: evePackage.version, source: "https://github.com/vercel/eve", documents },
    null,
    2,
  ) + "\n",
);
console.log(`Mirrored ${documents.length} eve documentation pages into public/reference.`);
