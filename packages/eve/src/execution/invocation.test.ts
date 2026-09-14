import { describe, expect, it } from "vitest";
import { Invocation } from "#execution/invocation.js";
import type { TokenUsage } from "#shared/token-usage.js";

describe("Invocation", () => {
  it("keeps an acknowledgement open until all owned results have been received", () => {
    const invocation = new Invocation();
    invocation.admitTasks(["research", "review"]);
    expect(invocation.finishTurn({ output: "Started" })).toBeUndefined();

    invocation.receiveResults(["research"]);
    expect(invocation.finishTurn({ output: "Partial answer" })).toBeUndefined();

    invocation.receiveResults(["review"]);
    expect(invocation.finishTurn({ output: "Combined answer" })).toEqual({
      output: "Combined answer",
    });
  });

  it("does not finish when result consumption parks for approval", () => {
    const invocation = new Invocation();
    invocation.admitTasks(["fact-check"]);
    invocation.receiveResults(["fact-check"]);

    expect(invocation.finishTurn(undefined)).toBeUndefined();
    expect(invocation.finishTurn({ output: "Approved research" })).toEqual({
      output: "Approved research",
    });
  });

  it("keeps unrelated invocations independent even when their results share a bundle", () => {
    const research = new Invocation();
    const review = new Invocation();
    research.admitTasks(["research"]);
    review.admitTasks(["review"]);

    review.receiveResults(["review", "older-task"]);
    expect(review.finishTurn({ output: "Review" })).toEqual({ output: "Review" });
    expect(research.finishTurn({ output: "Research pending" })).toBeUndefined();
  });

  it("keeps work admitted while consuming a previous result outstanding", () => {
    const invocation = new Invocation();
    invocation.admitTasks(["research"]);
    invocation.admitTasks(["fact-check"]);
    invocation.receiveResults(["research"]);
    expect(invocation.finishTurn({ output: "Checking findings" })).toBeUndefined();
    invocation.receiveResults(["fact-check"]);
    expect(invocation.finishTurn({ output: "Verified findings" })).toEqual({
      output: "Verified findings",
    });
  });

  it("reports failure with deferred usage and retains the caller until delivery succeeds", () => {
    const caller = {
      callId: "research",
      subagentName: "researcher",
      replyTo: { kind: "hook" as const, token: "parent" },
    };
    const invocation = new Invocation(caller);
    invocation.admitTasks(["fact-check"]);
    expect(invocation.finishTurn({ output: "Started", usage: usage(10) })).toBeUndefined();

    expect(invocation.finishTurn({ isError: true, output: "Failed", usage: usage(5) })).toEqual({
      isError: true,
      output: "Failed",
      usage: usage(15),
    });
    expect(invocation.caller).toBe(caller);
    expect(invocation.usage).toEqual(usage(10));
  });
});

function usage(inputTokens: number): TokenUsage {
  return { inputTokens, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
}
