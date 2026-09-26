// Keeps the product docs true: every relative link, referenced script and
// pnpm command must exist, and README "App pages" must match the real routes.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const docs = [
  "README.md",
  "AGENTS.md",
  ...readdirSync(join(root, "docs")).map((f) => `docs/${f}`),
].filter((file) => file.endsWith(".md"));
const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s/g, "-");
const anchors = (file) =>
  new Set([...readFileSync(file, "utf8").matchAll(/^#{1,6}\s+(.+)$/gm)].map((m) => slug(m[1])));

const problems = [];
for (const doc of docs) {
  const path = join(root, doc);
  const text = readFileSync(path, "utf8");
  for (const [, target] of text.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^[a-z]+:|^\/|^#$/.test(target)) continue;
    const [file, hash] = target.split("#");
    const resolved = file ? resolve(dirname(path), file) : path;
    if (!existsSync(resolved)) problems.push(`${doc}: link to missing ${target}`);
    else if (hash && resolved.endsWith(".md") && !anchors(resolved).has(hash))
      problems.push(`${doc}: link to missing heading ${target}`);
  }
  for (const [, script] of text.matchAll(/`(?:node |bash )?(scripts\/[\w./-]+\.(?:mjs|sh|ts))/g))
    if (!existsSync(join(root, script))) problems.push(`${doc}: missing ${script}`);
  for (const [, name] of text.matchAll(/`pnpm ([a-z][\w:-]*)/g))
    if (!(name in scripts) && !["install", "exec", "dlx", "add", "patch", "audit"].includes(name))
      problems.push(`${doc}: unknown command pnpm ${name}`);
}

const routes = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name === "page.tsx")
      routes.push(
        "/" +
          relative(join(root, "app"), dirname(path))
            .split("/")
            .filter((part) => !/^\(.*\)$/.test(part))
            .join("/"),
      );
  }
};
walk(join(root, "app"));
const readme = readFileSync(join(root, "README.md"), "utf8");
const appPages = readme.slice(readme.indexOf("## App pages"), readme.indexOf("## Run it"));
for (const route of routes)
  if (
    !route.startsWith("/auth") &&
    !route.includes("[sessionId]") &&
    !appPages.includes(`\`${route}\``)
  )
    problems.push(`README.md App pages: missing ${route}`);
for (const [, listed] of appPages.matchAll(/`(\/[^`]*)`/g))
  if (!routes.includes(listed)) problems.push(`README.md App pages: ${listed} is not a route`);

assert.deepEqual(problems, [], problems.join("\n"));
console.log(
  `PASS: ${docs.length} docs, their links, scripts, commands and ${routes.length} routes`,
);
