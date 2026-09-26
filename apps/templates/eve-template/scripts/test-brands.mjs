// Third-party logos: every maker in the model catalogs has a real name, every
// logo the app refers to exists in public/brands/, and nothing else ships.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { join, resolve } from "node:path";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^\.\.?\//.test(specifier) && !/\.(ts|mjs|js|json)$/.test(specifier))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});

const root = resolve(import.meta.dirname, "..");
const { BRAND_KEYS, REGISTRY_BRANDS } = await import("../lib/brand-icons.generated.ts");
const { knownMaker, makerBrand, makerLabel, PROVIDER_BRANDS, serviceBrand, hasBrand } =
  await import("../lib/brands.ts");
const snapshot = JSON.parse(readFileSync(join(root, "lib/model-catalogs.snapshot.json"), "utf8"));

const files = new Set(
  readdirSync(join(root, "public/brands")).map((file) => file.replace(/\.svg$/, "")),
);
assert.deepEqual([...files].sort(), [...BRAND_KEYS].sort(), "generated list matches the files");
for (const file of files) {
  const svg = readFileSync(join(root, "public/brands", `${file}.svg`), "utf8");
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d. -]+"/, file);
  assert.doesNotMatch(svg, /<script|on[a-z]+=|href=/i, `${file} is a plain drawing`);
}

// Every maker the catalogs offer reads as a name, never a slug like "arcee-ai".
const makers = new Set();
for (const catalog of [snapshot.gateway, snapshot.openrouter])
  for (const model of catalog) if (model.maker) makers.add(model.maker);
assert(makers.size > 20, "the snapshot lists makers");
for (const maker of makers) {
  assert(knownMaker(maker), `${maker} has a written name in lib/brands.ts`);
  assert.doesNotMatch(makerLabel(maker), /[-_]/, maker);
  const brand = makerBrand(maker);
  if (brand) assert(hasBrand(brand), `${maker}'s logo ${brand} exists`);
}
for (const brand of Object.values(PROVIDER_BRANDS)) assert(hasBrand(brand), brand);
for (const brand of Object.values(REGISTRY_BRANDS)) assert(hasBrand(brand), brand);
for (const service of ["github", "linear", "notion", "sentry", "telegram", "vercel"])
  assert(hasBrand(service), `${service} logo`);

// Tools named after a connected service get its logo; others stay plain.
assert.equal(serviceBrand("github__create_issue"), "github");
assert.equal(serviceBrand("linear_search"), "linear");
assert.equal(serviceBrand("make_image"), undefined);
assert.equal(serviceBrand("web_search"), undefined);
console.log(
  `PASS: ${files.size} logos, ${makers.size} catalog makers named, providers, registry and services resolved`,
);
