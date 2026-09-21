import type { ModelMessage } from "ai";
import type { InputRequest } from "#shared/input.js";
import { buildResolvedInputBatch } from "#harness/input-request-resolution.js";
import {
  queueDeferredStepInput,
  removePendingInputBatches,
} from "#harness/pending-input-batches.js";
import { resolveApprovalBatch } from "#harness/hitl/approval-input-requests.js";
import { resolveQuestionBatches } from "#harness/hitl/question-input-requests.js";
import { appendResolvedBatchTranscript } from "#harness/hitl/pending-input-resolution.js";
import type {
  ResolvePendingInputResult,
  ResolvedInputActionBatch,
} from "#harness/hitl/pending-input-resolution.js";
import type { InputAction } from "#harness/hitl/input-policy.js";
import { resolveSessionLimitContinuation } from "#harness/session-limit-continuation.js";
import type { HarnessSession } from "#harness/types.js";

/** Applies the selected action; tool/model execution stays in the existing durable runtime. */
export function applyInputAction(input: {
  readonly action: InputAction;
  readonly messages: ModelMessage[];
  readonly session: HarnessSession;
  readonly resolveApprovalKey?: (request: InputRequest) => string | undefined;
}): ResolvePendingInputResult {
  const { action, messages } = input;
  let session = input.session;
  let limitContinuation: ResolvePendingInputResult["limitContinuation"];
  let rejectedActions: readonly ResolvedInputActionBatch[] | undefined;
  let resolvedInputs: ResolvePendingInputResult["resolvedInputs"];
  if (action.kind === "resolve") {
    for (const { kind, batch } of action.batches) {
      switch (kind) {
        case "approval": {
          const approval = resolveApprovalBatch({
            batch,
            messages,
            responses: action.responses,
            session,
            resolveApprovalKey: input.resolveApprovalKey,
          });
          session = approval.session;
          rejectedActions = approval.rejectedActions;
          break;
        }
        case "question":
          resolveQuestionBatches({ batches: [batch], messages, responses: action.responses });
          break;
        case "session-limit":
          appendResolvedBatchTranscript(messages, batch, []);
          limitContinuation = resolveSessionLimitContinuation({
            requests: batch.requests,
            responses: action.responses,
          });
          break;
      }
    }
    const batches = action.batches.map(({ batch }) => batch);
    session = removePendingInputBatches(session, batches);
    resolvedInputs = batches.flatMap((batch) => {
      const resolved = buildResolvedInputBatch(batch, action.responses);
      return resolved === undefined ? [] : [resolved];
    });
  }
  if (action.deferredInput !== undefined)
    session = queueDeferredStepInput(session, action.deferredInput);
  return {
    outcome:
      action.kind === "resolve" ? "resolved" : action.kind === "wait" ? "unresolved" : "continue",
    consumedMessage: action.consumedMessage,
    deferredMessage: action.deferredMessage,
    deferredContext: action.deferredContext,
    messages,
    session,
    limitContinuation,
    rejectedActions,
    resolvedInputs,
  };
}
