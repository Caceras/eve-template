// Words the UI shows for machine-facing text: Activity's session actions
// report sentences, never raw JSON or response bodies, and skills read as what
// they do rather than as instructions to the model.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  describeSessionError,
  describeSessionResult,
  errorDetail,
} from "../lib/chat/session-results.ts";
import { skillSummary } from "../lib/skills.ts";

test("skills read as what they do, one sentence, for people", () => {
  assert.equal(
    skillSummary(
      "Use when the user wants help planning a trip or deciding what to do in a destination.",
    ),
    "Planning a trip or deciding what to do in a destination.",
  );
  assert.equal(
    skillSummary(
      "Use when asked to review a pull request, look at a PR, or explain what a diff does. Covers reading the diff.",
    ),
    "Review a pull request, look at a PR, or explain what a diff does.",
  );
  assert.equal(
    skillSummary("Use when the user asks for a daily summary or when a task asks for one."),
    "A daily summary or when a task asks for one.",
  );
  assert.equal(
    skillSummary("Run a structured deep-research pass only when the task needs it."),
    "Run a structured deep-research pass only when the task needs it.",
  );
  assert.equal(skillSummary(""), "");
  // Every skill this app ships loses the model-facing lead-in.
  const root = join(import.meta.dirname, "../agent/skills");
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = entry.isDirectory() ? join(root, entry.name, "SKILL.md") : join(root, entry.name);
    if (!file.endsWith(".md")) continue;
    const description = readFileSync(file, "utf8").match(/^description:\s*(.+)$/m)?.[1] ?? "";
    assert.doesNotMatch(skillSummary(description), /^use when/i, file);
  }
});

test("session actions read as sentences", () => {
  assert.equal(
    describeSessionResult("cancel", { sessionId: "s1", status: "accepted" }),
    "Stop requested. The reply in progress ends shortly.",
  );
  assert.equal(
    describeSessionResult("cancel", { status: "no_active_turn" }),
    "Nothing to stop: no reply is in progress.",
  );
  assert.match(describeSessionResult("compact", { status: "accepted" }), /^Compaction queued\./);
  assert.match(
    describeSessionResult("clear", { status: "accepted" }),
    /chat history stays visible/,
  );
  assert.equal(
    describeSessionResult("reset", { previousSessionId: "s1", status: "reset" }),
    "Conversation reset. Its next message starts a new session.",
  );
  for (const action of ["compact", "clear", "reset"])
    assert.match(
      describeSessionResult(action, { status: "no_active_session" }),
      /no longer active/,
    );
  assert.equal(describeSessionResult("compact", null), "Done.");
  for (const action of ["cancel", "compact", "clear", "reset"])
    assert.doesNotMatch(describeSessionResult(action, { status: "accepted" }), /[{}"]/);
});

test("failures keep the server's reason but never a raw body", () => {
  assert.equal(
    describeSessionError("compact", new Error("Session not found")),
    "Couldn't compact this session. Session not found.",
  );
  assert.equal(
    describeSessionError("reset", new Error('{"error":"x"}')),
    "Couldn't reset this conversation.",
  );
  assert.equal(errorDetail(new Error("<!doctype html><html>")), "");
  assert.equal(errorDetail(new Error("x".repeat(200))), "");
  assert.equal(errorDetail("not an error"), "");
  assert.equal(errorDetail(new Error("Already done!")), " Already done!");
});
