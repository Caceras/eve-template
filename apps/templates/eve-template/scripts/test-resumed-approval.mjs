// Per-turn user notes (the clock, a composer skill) stay off the turn that
// carries out an answered approval: the AI SDK runs an approved call only while
// the answer is the last message, so a note after it left the call unrun.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const { resumesApproval } = await import("../agent/lib/resumed-approval.ts");

const pending = {
  role: "user",
  content:
    '[Pending approvals]\nThe following tool calls are awaiting approval and have not executed:\n{"requestId":"a","toolName":"write_file"}',
};
assert.equal(resumesApproval([]), false, "a first turn");
assert.equal(resumesApproval([{ role: "user", content: "Hello" }]), false);
assert.equal(
  resumesApproval([
    { role: "user", content: "Hello" },
    { role: "assistant", content: [{ type: "text", text: "Hi" }] },
  ]),
  false,
  "a turn after a finished reply",
);
assert.equal(resumesApproval([{ role: "user", content: "Write it" }, pending]), true);
assert.equal(
  resumesApproval([{ role: "user", content: [{ type: "text", text: pending.content }] }]),
  true,
  "the note as text parts",
);
assert.equal(
  resumesApproval([pending, { role: "assistant", content: "Done" }]),
  false,
  "an approval settled earlier",
);

// Every per-turn user-role instruction checks it.
const perTurn = readdirSync(join(root, "agent/instructions"))
  .map((file) => [file, readFileSync(join(root, "agent/instructions", file), "utf8")])
  .filter(([, source]) => /"turn\.started"/.test(source) && /role: "user"/.test(source));
assert.deepEqual(perTurn.map(([file]) => file).sort(), ["clock.ts", "composer-skill.ts"]);
for (const [file, source] of perTurn)
  assert.match(source, /if \(resumesApproval\(ctx\.messages\)\) return null;/, file);
console.log("PASS: per-turn notes skip the turn that runs an answered approval");
