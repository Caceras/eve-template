// Real logos for the third parties the app names: model makers, model
// providers, accounts, connections and the eve registry's channels and
// services. Monochrome SVGs go to public/brands/ and are drawn in the text
// colour (components/brand-icon.tsx), so they follow light and dark like the
// rest of the UI. Sources, pinned: LobeHub Icons (MIT) for AI companies and
// Simple Icons (CC0) for everything else; see NOTICE. `pnpm brands:sync`
// downloads them into node_modules/.cache and rewrites the files it owns.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const cache = join(root, "node_modules/.cache/brand-icons");
const out = join(root, "public/brands");
const PACKAGES = { lobe: "@lobehub/icons-static-svg@1.95.1", si: "simple-icons@16.32.0" };

// Brand key → source icon. Keys are what lib/brands.ts refers to.
const BRANDS = {
  // Model makers
  anthropic: ["lobe", "anthropic"],
  alibaba: ["lobe", "alibabacloud"],
  amazon: ["lobe", "aws"],
  arcee: ["lobe", "arcee"],
  aionlabs: ["lobe", "aionlabs"],
  bytedance: ["lobe", "bytedance"],
  cohere: ["lobe", "cohere"],
  deepseek: ["lobe", "deepseek"],
  dotsstudio: ["lobe", "dotsstudio"],
  google: ["lobe", "google"],
  ibm: ["lobe", "ibm"],
  inception: ["lobe", "inception"],
  kwaipilot: ["lobe", "kwaipilot"],
  liquid: ["lobe", "liquid"],
  meituan: ["lobe", "longcat"],
  meta: ["lobe", "meta"],
  minimax: ["lobe", "minimax"],
  mistral: ["lobe", "mistral"],
  moonshot: ["lobe", "moonshot"],
  nvidia: ["lobe", "nvidia"],
  openai: ["lobe", "openai"],
  perplexity: ["lobe", "perplexity"],
  poolside: ["lobe", "poolside"],
  qwen: ["lobe", "qwen"],
  reka: ["lobe", "reka"],
  relace: ["lobe", "relace"],
  sakana: ["lobe", "sakana"],
  stepfun: ["lobe", "stepfun"],
  tencent: ["lobe", "tencent"],
  upstage: ["lobe", "upstage"],
  xai: ["lobe", "xai"],
  xiaomi: ["si", "xiaomi"],
  zai: ["lobe", "zai"],
  // Model providers and accounts
  openrouter: ["lobe", "openrouter"],
  vercel: ["si", "vercel"],
  github: ["si", "github"],
  linear: ["si", "linear"],
  notion: ["si", "notion"],
  sentry: ["si", "sentry"],
  telegram: ["si", "telegram"],
  microsoft: ["lobe", "microsoft"],
};

// Registry names whose logo lives under another slug.
const REGISTRY_ALIASES = {
  "channel/chat-sdk-gchat": "googlechat",
  "channel/chat-sdk-x": "x",
  "channel/photon-imessage": "imessage",
  "channel/teams": "microsoft",
  "connection/hugging-face": "huggingface",
  "extension/github-tools": "github",
  "memory/upstash-agentkit": "upstash",
};

function fetchPackages() {
  rmSync(cache, { recursive: true, force: true });
  mkdirSync(cache, { recursive: true });
  for (const [name, spec] of Object.entries(PACKAGES)) {
    const tarball = execFileSync("npm", ["pack", spec, "--silent"], {
      cwd: cache,
      encoding: "utf8",
    })
      .trim()
      .split("\n")
      .pop();
    mkdirSync(join(cache, name), { recursive: true });
    execFileSync("tar", ["xzf", tarball, "-C", name, "--strip-components=1"], { cwd: cache });
  }
}

const source = (pack, slug) => join(cache, pack, "icons", `${slug}.svg`);

// One clean, monochrome SVG: no title, colour from the mask, any size.
function clean(svg) {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1];
  const body = svg
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .trim();
  if (!viewBox || !body) throw new Error("Unexpected SVG shape.");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="#000">${body}</svg>\n`;
}

fetchPackages();
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const written = new Set();
function write(key, pack, slug) {
  const file = source(pack, slug);
  if (!existsSync(file)) return false;
  writeFileSync(join(out, `${key}.svg`), clean(readFileSync(file, "utf8")));
  written.add(key);
  return true;
}
for (const [key, [pack, slug]] of Object.entries(BRANDS))
  if (!write(key, pack, slug)) throw new Error(`Missing ${pack} icon ${slug} for ${key}.`);

// The registry lists what eve can add; match each item to a logo by name.
const surface = readFileSync(join(root, "lib/eve-surface.generated.ts"), "utf8");
const registry = [
  ...surface.matchAll(
    /"name": "((?:channel|connection|extension|instrumentation|memory)\/[^"]+)"/g,
  ),
].map((match) => match[1]);
const siSlugs = new Set(readdirSync(join(cache, "si", "icons")).map((file) => file.slice(0, -4)));
const registryBrands = {};
for (const name of registry) {
  const tail = name.split("/")[1].replace(/^chat-sdk-/, "");
  const slug = REGISTRY_ALIASES[name] ?? tail.replace(/-/g, "");
  const key = BRANDS[slug] ? slug : siSlugs.has(slug) && write(slug, "si", slug) ? slug : null;
  if (key) registryBrands[name] = key;
}

writeFileSync(
  join(root, "lib/brand-icons.generated.ts"),
  `// Generated by scripts/sync-brand-icons.mjs from ${Object.values(PACKAGES).join(" and ")}.\n` +
    `// Do not edit by hand; run \`pnpm brands:sync\`.\n\n` +
    `/** Logos in public/brands/, by key. */\n` +
    `export const BRAND_KEYS: ReadonlySet<string> = new Set(${JSON.stringify([...written].sort())});\n\n` +
    `/** eve registry items that have a logo. */\n` +
    `export const REGISTRY_BRANDS: Readonly<Record<string, string>> = ${JSON.stringify(registryBrands, null, 2)};\n`,
);
// The generated module follows the repository's formatting like hand-written code.
execFileSync("pnpm", ["exec", "oxfmt", "lib/brand-icons.generated.ts"], { cwd: root });
console.log(
  `${written.size} logos in public/brands; ${Object.keys(registryBrands).length} of ${registry.length} registry items matched.`,
);
console.log(`Unmatched: ${registry.filter((name) => !registryBrands[name]).join(", ")}`);
