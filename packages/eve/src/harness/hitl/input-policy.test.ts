import { describe, expect, it } from "vitest";
import { decidePendingInput } from "#harness/hitl/input-policy.js";
import type { PendingInputBatch } from "#harness/pending-input-batches.js";
import { createSessionLimitContinuationRequest } from "#harness/session-limit-continuation.js";
import type { InputRequest } from "#shared/input.js";

function approval(requestId: string): InputRequest {
  return {
    requestId,
    kind: "tool-approval",
    prompt: "Approve the change?",
    display: "confirmation",
    allowFreeform: false,
    options: [
      { id: "approve", label: "Approve" },
      { id: "cancel", label: "Cancel" },
    ],
    action: { kind: "tool-call", callId: requestId, toolName: requestId, input: {} },
  };
}
function question(requestId: string): InputRequest {
  return {
    requestId,
    kind: "question",
    prompt: "Which color?",
    display: "select",
    options: [{ id: "red", label: "Red" }],
    action: { kind: "tool-call", callId: requestId, toolName: "ask_question", input: {} },
  };
}
function batch(...requests: InputRequest[]): PendingInputBatch {
  return {
    requests,
    responseMessages: [],
    event: { turnId: "earlier", stepIndex: 0, sequence: 1 },
  };
}
const A = batch(approval("A"));
const B = batch(approval("B"));
const AB = batch(approval("A"), approval("B"));
const Q = batch(question("Q"));
const limit = batch(
  createSessionLimitContinuationRequest({
    sessionId: "session",
    violation: { kind: "output", limit: 10, usedTokens: 10 },
  }),
);
const approveA = { requestId: "A", optionId: "approve" };

describe("Given pending HITL requests [policy]", () => {
  it("When a later tool result needs interpretation, Then continue without resolving A [regression]", () => {
    expect(decidePendingInput({ batches: [A], activeTurnId: "later", internalStep: true })).toEqual(
      { kind: "continue", deferredInput: undefined },
    );
  });
  it("When this turn still needs its own approval, Then wait [control]", () => {
    expect(
      decidePendingInput({ batches: [A], activeTurnId: "earlier", internalStep: true }).kind,
    ).toBe("wait");
  });
  it("When only A in an A+B batch is answered, Then retain A without scheduling the batch [regression]", () => {
    expect(
      decidePendingInput({ batches: [AB], stepInput: { inputResponses: [approveA] } }),
    ).toEqual({
      kind: "wait",
      deferredInput: { inputResponses: [approveA] },
    });
  });
  it("When partial A accompanies a later continuation, Then retain A and continue [regression]", () => {
    expect(
      decidePendingInput({
        batches: [AB],
        activeTurnId: "later",
        internalStep: true,
        stepInput: { inputResponses: [approveA] },
      }),
    ).toEqual({
      kind: "continue",
      deferredInput: { inputResponses: [approveA] },
    });
  });
  it("When a user message arrives beside partial A, Then continue that message [regression]", () => {
    expect(
      decidePendingInput({
        batches: [AB],
        stepInput: { inputResponses: [approveA], message: "Read the draft." },
      }),
    ).toMatchObject({
      kind: "continue",
      deferredInput: { inputResponses: [approveA] },
    });
  });
  it("When A and a later question are answered together, Then resolve A and retain the question answer [regression]", () => {
    const answer = { requestId: "Q", optionId: "red" };
    const action = decidePendingInput({
      batches: [A, B, Q],
      stepInput: { inputResponses: [approveA, answer] },
    });
    expect(action).toMatchObject({
      kind: "resolve",
      batches: [{ kind: "approval", batch: A }],
      deferredInput: { inputResponses: [answer] },
    });
    // Given A has resolved and its tool/reply have completed, the saved Q response is the next input.
    if (action.kind !== "resolve") throw new Error("Expected resolution");
    expect(decidePendingInput({ batches: [B, Q], stepInput: action.deferredInput })).toMatchObject({
      kind: "resolve",
      batches: [{ kind: "question", batch: Q }],
      responses: [answer],
      deferredInput: undefined,
    });
  });
  it("When a question precedes a ready approval, Then preserve transcript order with approval last [control]", () => {
    expect(
      decidePendingInput({
        batches: [Q, A],
        stepInput: { inputResponses: [{ requestId: "Q", optionId: "red" }, approveA] },
      }),
    ).toMatchObject({
      kind: "resolve",
      batches: [
        { kind: "question", batch: Q },
        { kind: "approval", batch: A },
      ],
    });
  });
  it("When a new message replaces the sole question, Then dismiss that question [control]", () => {
    expect(
      decidePendingInput({ batches: [Q], stepInput: { message: "Read the draft instead." } }),
    ).toEqual({
      kind: "resolve",
      batches: [{ kind: "question", batch: Q }],
      responses: [],
      deferredInput: undefined,
    });
  });
  it("When multiple questions remain, Then a new message does not dismiss them [regression]", () => {
    expect(
      decidePendingInput({
        batches: [Q, batch(question("Q2"))],
        stepInput: { message: "Read the draft." },
      }).kind,
    ).toBe("continue");
  });
  it("When a budget limit is open, Then an unrelated approval cannot bypass it [control]", () => {
    expect(
      decidePendingInput({ batches: [A, limit], stepInput: { inputResponses: [approveA] } }),
    ).toEqual({
      kind: "wait",
      deferredInput: { inputResponses: [approveA] },
      deferredMessage: true,
    });
  });
  it("When a budget grant arrives beside A, Then resolve only the limit and retain A [control]", () => {
    expect(
      decidePendingInput({
        batches: [A, limit],
        stepInput: {
          inputResponses: [
            approveA,
            { requestId: limit.requests[0]!.requestId, optionId: "continue" },
          ],
        },
      }),
    ).toMatchObject({
      kind: "resolve",
      batches: [{ kind: "session-limit", batch: limit }],
      deferredInput: { inputResponses: [approveA] },
    });
  });
  it("When authorization requires an identified response, Then plain approval text stays a user message [control]", () => {
    const protectedA = { ...A, responseAuthRequiredRequestIds: ["A"] };
    expect(
      decidePendingInput({ batches: [protectedA], stepInput: { message: "approve" } }),
    ).toMatchObject({ kind: "continue", consumedMessage: undefined });
    expect(decidePendingInput({ batches: [A], stepInput: { message: "approve" } })).toMatchObject({
      kind: "resolve",
      consumedMessage: true,
    });
  });
  it("When the same facts are evaluated twice, Then the decision is identical and facts stay untouched [control]", () => {
    const input = {
      batches: [A, B, Q],
      stepInput: { inputResponses: [approveA, { requestId: "Q", optionId: "red" }] },
    };
    const snapshot = structuredClone(input);
    function freeze(value: unknown): void {
      if (value === null || typeof value !== "object") return;
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    freeze(input);
    expect(decidePendingInput(input)).toEqual(decidePendingInput(input));
    expect(input).toEqual(snapshot);
  });
});
