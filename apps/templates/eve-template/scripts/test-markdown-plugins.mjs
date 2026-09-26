// Replies load math (KaTeX), diagrams (mermaid) and CJK line breaking only when
// their text needs them, so a chat without them never downloads those plugins.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const { neededPlugins } = await import("../lib/markdown-plugins.ts");

assert.deepEqual(neededPlugins("Plain **text**, a `code` span and\n```ts\nconst a = 1;\n```"), []);
assert.deepEqual(neededPlugins("Energy: $$E = mc^2$$"), ["math"]);
assert.deepEqual(neededPlugins("It costs $5, or $10 with delivery."), [], "prices are not math");
assert.deepEqual(neededPlugins("```mermaid\ngraph TD; A-->B\n```"), ["mermaid"]);
assert.deepEqual(neededPlugins("~~~ mermaid\nflowchart LR\n~~~"), ["mermaid"]);
assert.deepEqual(neededPlugins("日本語のテキストです。"), ["cjk"]);
assert.deepEqual(neededPlugins("한국어 문장"), ["cjk"]);
assert.deepEqual(neededPlugins("$$x$$ in 中文\n```mermaid\nA\n```").sort(), [
  "cjk",
  "math",
  "mermaid",
]);

// The math chunk brings the KaTeX styles it needs (without them formulas render twice).
assert.match(
  readFileSync(join(root, "lib/markdown-math.ts"), "utf8"),
  /import "katex\/dist\/katex\.min\.css"/,
);

// Nothing else imports those plugins statically, which would put them back in every chat.
const heavy = /from "@streamdown\/(?:math|mermaid|cjk)"/;
const allowed = new Set(["lib/markdown-plugins.ts", "lib/markdown-math.ts"]);
const offenders = [];
for (const directory of ["app", "components", "lib"])
  for (const entry of readdirSync(join(root, directory), {
    recursive: true,
    withFileTypes: true,
  })) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const file = relative(root, join(entry.parentPath, entry.name));
    if (!allowed.has(file) && heavy.test(readFileSync(join(root, file), "utf8")))
      offenders.push(file);
  }
assert.deepEqual(offenders, [], "import these plugins through lib/markdown-plugins.ts");

console.log("PASS: math, diagram and CJK plugins load only for replies that need them");
