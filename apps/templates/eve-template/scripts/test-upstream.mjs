// Every file this app changes or removes from the official eve chat template
// must carry a reason in docs/upstream-divergence.json, pinned to the upstream
// version it was reviewed against. When upstream changes such a file, this
// fails so the change gets ported. Run with --write after a review to record
// new divergences (reason "TODO") and refresh fingerprints.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const base = resolve(root, "../eve-chat-template");
const listPath = join(root, "docs/upstream-divergence.json");
if (!existsSync(base)) {
  console.log("SKIP: the upstream eve-chat-template is only available inside the eve monorepo");
  process.exit(0);
}
const files = (dir) =>
  new Set(
    execFileSync("git", ["ls-files"], { cwd: dir, encoding: "utf8" }).split("\n").filter(Boolean),
  );
const read = (dir, file) => (existsSync(join(dir, file)) ? readFileSync(join(dir, file)) : null);
const fingerprint = (file) =>
  createHash("sha256").update(read(base, file)).digest("hex").slice(0, 12);

const product = files(root);
const diverged = [...files(base)]
  .filter((file) => !product.has(file) || !read(base, file).equals(read(root, file)))
  .sort();
const list = JSON.parse(readFileSync(listPath, "utf8"));

if (process.argv.includes("--write")) {
  const next = {};
  for (const file of diverged)
    next[file] = { reason: list[file]?.reason ?? "TODO", upstream: fingerprint(file) };
  writeFileSync(listPath, JSON.stringify(next, null, 2) + "\n");
  console.log(`Recorded ${diverged.length} divergences in docs/upstream-divergence.json`);
  process.exit(0);
}

const problems = [];
for (const file of diverged) {
  const entry = list[file];
  if (!entry)
    problems.push(`${file}: differs from upstream; restore it or record a reason (--write)`);
  else if (!entry.reason || entry.reason === "TODO") problems.push(`${file}: needs a reason`);
  else if (entry.upstream !== fingerprint(file))
    problems.push(`${file}: upstream changed since review; port it, then refresh with --write`);
}
for (const file of Object.keys(list))
  if (!diverged.includes(file))
    problems.push(`${file}: matches upstream again; remove it from the list`);

assert.deepEqual(problems, [], problems.join("\n"));
const shared = diverged.length;
console.log(
  `PASS: ${shared} reviewed divergences from eve-chat-template, all pinned to current upstream`,
);
