import type { ModelMessage } from "ai";
import type { RuntimeToolCallActionRequest } from "#shared/action-types.js";
import type { InputRequest } from "#shared/input.js";
import { hasTailApprovalResponse } from "#harness/current-messages.js";
import { getApprovedTools } from "#harness/hitl/approval-input-requests.js";
import type { RejectedActionBatch } from "#harness/hitl/approval-input-requests.js";
import { isApprovalRequest } from "#harness/input-request-class.js";
import { getDeferredStepInput, getPendingInputBatches } from "#harness/pending-input-batches.js";
import type { ResolvePendingInputResult } from "#harness/hitl/pending-input-resolution.js";
import { decidePendingInput } from "#harness/hitl/input-policy.js";
import { applyInputAction } from "#harness/hitl/input-effects.js";
import { resolveToolCallInputObject } from "#harness/coordination.js";
import { clearPendingSessionLimitPrompt } from "#harness/hitl/session-limit-input-requests.js";
import type { HarnessSession, StepInput } from "#harness/types.js";
import { readClientContext } from "#internal/client-context.js";

export { getApprovedTools, clearPendingSessionLimitPrompt };
export type { RejectedActionBatch };
export type { ResolvedInputBatch } from "#harness/input-request-resolution.js";
export {
  appendPendingInputBatch,
  consumeDeferredStepInput,
  getPendingInputRequestIds,
  hasDeferredStepInput,
  hasPendingInputBatch,
} from "#harness/pending-input-batches.js";

/** Returns true when the step input carries user-facing turn input. */
export function hasStepInput(input?: StepInput): boolean {
  if (input === undefined) return false;
  return input.message !== undefined || (input.inputResponses?.length ?? 0) > 0;
}

/** Stored partial answers are not runnable work until they can resolve a batch. */
export function hasRunnableDeferredStepInput(session: HarnessSession): boolean {
  const deferred = getDeferredStepInput(session);
  if (deferred === undefined) return false;
  if (
    deferred.message !== undefined ||
    (deferred.context?.length ?? 0) > 0 ||
    readClientContext(deferred) !== undefined ||
    deferred.outputSchema !== undefined ||
    (deferred.runtimeActionResults?.length ?? 0) > 0
  )
    return true;

  return (
    decidePendingInput({
      batches: getPendingInputBatches(session.state),
      stepInput: {
        inputResponses: [
          ...(deferred.inputResponses ?? []),
          ...(deferred.attributedInputResponses ?? []).map(({ response }) => response),
        ],
      },
    }).kind === "resolve"
  );
}

/** Returns true when any pending batch still contains a tool approval. */
export function hasPendingApprovalBatch(session: HarnessSession): boolean {
  return getPendingInputBatches(session.state).some((batch) =>
    batch.requests.some((request) => isApprovalRequest(request)),
  );
}

/** Reads existing state, asks the policy for an action, and applies that action once. */
export function resolvePendingInput(input: {
  readonly activeTurnId?: string;
  readonly internalStep?: boolean;
  readonly deferMessagesWhileApprovalsPending?: boolean;
  readonly history?: readonly ModelMessage[];
  readonly resolveApprovalKey?: (request: InputRequest) => string | undefined;
  readonly session: HarnessSession;
  readonly stepInput?: StepInput;
}): ResolvePendingInputResult {
  const messages = [...(input.history ?? input.session.history)];
  const action = decidePendingInput({
    batches: getPendingInputBatches(input.session.state),
    stepInput: input.stepInput,
    activeTurnId: input.activeTurnId,
    internalStep: input.internalStep,
    deferMessagesWhileApprovalsPending: input.deferMessagesWhileApprovalsPending,
    deferTurnInput: hasTailApprovalResponse(messages),
  });
  return applyInputAction({
    action,
    messages,
    session: input.session,
    resolveApprovalKey: input.resolveApprovalKey,
  });
}

/** Creates a runtime tool-call action shape from an AI SDK tool call. */
export function createRuntimeToolCallActionFromToolCall(input: {
  readonly toolCall: {
    readonly input: unknown;
    readonly toolCallId: string;
    readonly toolName: string;
  };
}): RuntimeToolCallActionRequest {
  return {
    callId: input.toolCall.toolCallId,
    input: resolveToolCallInputObject(input.toolCall.input, {
      callId: input.toolCall.toolCallId,
      toolName: input.toolCall.toolName,
    }),
    kind: "tool-call",
    toolName: input.toolCall.toolName,
  };
}
