// Guards against JavaScript that every visitor pays for without needing it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const read = (file) => readFileSync(join(root, file), "utf8");

// One shiki: streamdown's code plugin needs 3.x, and a second major would
// ship every grammar and the Oniguruma WASM twice.
const lock = read("pnpm-lock.yaml");
const shikiMajors = new Set(
  [...lock.matchAll(/^ {2}'?(?:shiki|@shikijs\/(?!vscode-textmate)[\w-]+)@(\d+)\./gm)].map(
    (match) => match[1],
  ),
);
assert.deepEqual([...shikiMajors], ["3"], "one major version of shiki and @shikijs/*");
const dependencies = JSON.parse(read("package.json")).dependencies;
assert.match(dependencies.shiki, /^3\./, "the app's shiki matches @streamdown/code's");

// Search (cmdk) loads on demand: nothing imports the palette statically.
const importers = (module) =>
  ["app/(chat)/layout.tsx", "app/_components/agent-chat-shell.tsx", "app/layout.tsx"].filter(
    (file) => new RegExp(`from "[^"]*${module}"`).test(read(file)),
  );
assert.deepEqual(importers("command-menu"), [], "the chat shell imports only the launcher");
assert.match(read("app/_components/command-menu-launcher.tsx"), /import\("\.\/command-menu"\)/);
assert.doesNotMatch(read("app/_components/command-menu-launcher.tsx"), /from "cmdk"|ui\/command"/);

// The model picker's button is on every page with a composer; its cmdk list loads on demand.
const picker = read("components/chat/model-picker.tsx");
assert.doesNotMatch(picker, /from "cmdk"|ui\/command"|from "\.\/model-picker-list"/);
assert.match(picker, /import\("\.\/model-picker-list"\)/);

console.log(
  "PASS: bundle weight: one shiki major, Search and the model list loaded on demand (cmdk off the first load)",
);
