// Read aloud speaks the prose of a reply: markdown and links go, meaning stays.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^\.\.?\//.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const { speakableText } = await import("../lib/voice/speech.ts");

assert.equal(
  speakableText("It is -5°C tonight, **-2°C** tomorrow."),
  "It is -5°C tonight, -2°C tomorrow.",
);
assert.equal(speakableText("Between -5 and (-12)."), "Between -5 and (-12).");
assert.equal(
  speakableText("Due 2026-09-26 for the well-known client."),
  "Due 2026-09-26 for the well-known client.",
);
assert.equal(
  speakableText("- Milk\n- Bread\n  - Rye"),
  "Milk Bread Rye",
  "list bullets are not read",
);
assert.equal(
  speakableText("Intro\n\n---\n\n## Plan\n***\nDone"),
  "Intro Plan Done",
  "rules and headings go",
);
assert.equal(speakableText("| a | b |\n|---|---|\n| 1 | 2 |"), "a b 1 2");
assert.equal(speakableText("Paris - the capital -- is big."), "Paris the capital is big.");
assert.equal(
  speakableText("See [the docs](https://example.test/x) or https://example.test.\n```js\nx--\n```"),
  "See the docs or (code block)",
);
console.log(
  "PASS: read aloud keeps minus signs, dates and hyphenated words; drops bullets, rules, tables, links and code",
);
