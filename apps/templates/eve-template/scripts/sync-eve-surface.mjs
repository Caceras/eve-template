import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const templateRoot = resolve(process.cwd());
const repoRoot = resolve(templateRoot, '../../..');
const evePackage = JSON.parse(readFileSync(join(repoRoot, 'packages/eve/package.json'), 'utf8'));
const registry = JSON.parse(readFileSync(join(repoRoot, 'apps/docs/registry.json'), 'utf8'));

const items = (registry.items ?? []).map((item) => ({
  name: item.name,
  title: item.title ?? item.name,
  description: item.description ?? '',
  category: String(item.name).split('/')[0],
  implementation: item.meta?.eve?.implementation ?? null,
  requires: item.meta?.eve?.requires ?? null,
  docs: item.meta?.eve?.docs ?? null,
}));

const snapshot = {
  eveVersion: evePackage.version,
  packageExports: Object.keys(evePackage.exports ?? {}).sort(),
  registryItems: items.sort((a, b) => a.name.localeCompare(b.name)),
};

writeFileSync(join(templateRoot, 'lib/eve-surface.generated.ts'), `// Generated from the checked-out Eve source. Do not edit by hand.\nexport const eveSurface = ${JSON.stringify(snapshot, null, 2)} as const;\n`);
console.log(`Synced Eve ${snapshot.eveVersion}: ${snapshot.packageExports.length} public exports, ${snapshot.registryItems.length} registry items.`);
