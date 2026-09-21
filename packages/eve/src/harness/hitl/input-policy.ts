import { resolveTextToResponses } from "#channel/resolve-text.js";
import { isApprovalRequest } from "#harness/input-request-class.js";
import type { PendingInputBatch } from "#harness/pending-input-batches.js";
import { compactStepInput } from "#harness/hitl/pending-input-resolution.js";
import type { ResolvedStepInput } from "#harness/hitl/pending-input-resolution.js";
import { isSessionLimitContinuationRequest } from "#harness/session-limit-continuation.js";
import type { StepInput } from "#harness/types.js";
import { attachClientContext, readClientContext } from "#internal/client-context.js";
import type { InputResponse } from "#shared/input.js";

type InputBatch = {
  readonly kind: "approval" | "question" | "session-limit";
  readonly batch: PendingInputBatch;
};

export type InputAction = {
  readonly consumedMessage?: boolean;
  readonly deferredInput?: ResolvedStepInput;
  readonly deferredMessage?: boolean;
  readonly deferredContext?: boolean;
} & (
  | { readonly kind: "continue" | "wait" }
  | {
      readonly kind: "resolve";
      readonly batches: readonly InputBatch[];
      readonly responses: readonly InputResponse[];
    }
);

/** Chooses work from existing facts without changing session state or executing tools. */
export function decidePendingInput(input: {
  readonly batches: readonly PendingInputBatch[];
  readonly stepInput?: StepInput;
  readonly activeTurnId?: string;
  readonly internalStep?: boolean;
  readonly deferMessagesWhileApprovalsPending?: boolean;
  readonly deferTurnInput?: boolean;
}): InputAction {
  if (input.batches.length === 0) return { kind: "continue" };
  const batches = input.batches.map(classifyInputBatch);
  const limit = batches.find(({ kind }) => kind === "session-limit");
  const hasApproval = batches.some(({ kind }) => kind === "approval");
  const textBatch = limit?.batch ?? (batches.length === 1 ? batches[0]?.batch : undefined);
  const stepInput: ResolvedStepInput | undefined =
    textBatch === undefined ? input.stepInput : resolveTextMessageInput(textBatch, input.stepInput);
  const responses = canonicalizeInputResponses(stepInput?.inputResponses ?? []);
  const responseIds = new Set(responses.map(({ requestId }) => requestId));
  let ready = batches.filter(({ kind, batch }) => {
    const answered = (request: PendingInputBatch["requests"][number]) =>
      responseIds.has(request.requestId);
    switch (kind) {
      case "approval":
        return batch.requests.every((request) => !isApprovalRequest(request) || answered(request));
      case "question":
        return batch.requests.some(answered);
      case "session-limit":
        return batch.requests.length > 0 && batch.requests.every(answered);
    }
  });

  if (
    input.internalStep === true &&
    input.activeTurnId !== undefined &&
    limit === undefined &&
    stepInput?.message === undefined &&
    (responses.length === 0 || (hasApproval && ready.length === 0)) &&
    batches.every(
      ({ batch }) => batch.event !== undefined && batch.event.turnId !== input.activeTurnId,
    )
  ) {
    return {
      kind: "continue",
      deferredInput: stepInput === undefined ? undefined : compactStepInput(stepInput),
    };
  }

  if (
    limit === undefined &&
    hasApproval &&
    input.deferMessagesWhileApprovalsPending === true &&
    stepInput?.message !== undefined &&
    !ready.some(({ kind }) => kind === "approval")
  ) {
    return { kind: "wait", deferredInput: compactStepInput(stepInput), deferredMessage: true };
  }
  if (responses.length === 0 && stepInput?.message === undefined) {
    const deferredInput = compactStepInput(stepInput);
    return {
      kind: "wait",
      deferredInput:
        deferredInput.context !== undefined ||
        readClientContext(deferredInput) !== undefined ||
        deferredInput.outputSchema !== undefined
          ? deferredInput
          : undefined,
    };
  }

  if (limit !== undefined) {
    if (!ready.includes(limit))
      return { kind: "wait", deferredInput: compactStepInput(stepInput), deferredMessage: true };
    ready = [limit];
  } else {
    // AI SDK executes an approved call from the tail tool message. Keep later batches for the next step.
    const approvalIndex = ready.findIndex(({ kind }) => kind === "approval");
    if (approvalIndex >= 0) ready = ready.slice(0, approvalIndex + 1);
  }
  const remaining = batches.filter((batch) => !ready.includes(batch));
  const leftoverResponses = responses.filter((response) =>
    remaining.some(({ batch }) =>
      batch.requests.some((request) => request.requestId === response.requestId),
    ),
  );

  if (ready.length === 0) {
    if (stepInput?.message === undefined)
      return { kind: "wait", deferredInput: compactStepInput(stepInput) };
    // A new message dismisses a sole question, but never an approval or multiple questions.
    if (!hasApproval && batches.length === 1) {
      return {
        kind: "resolve",
        batches,
        responses: [],
        consumedMessage: stepInput.messageConsumed,
      };
    }
    return {
      kind: "continue",
      consumedMessage: stepInput.messageConsumed,
      deferredInput:
        leftoverResponses.length > 0 ? { inputResponses: leftoverResponses } : undefined,
    };
  }

  const deferTurnInput =
    input.deferTurnInput === true ||
    ready.some(({ kind }) => kind === "approval") ||
    (limit !== undefined &&
      remaining.some(({ batch }) => batch.requests.some(isSessionLimitContinuationRequest)));
  const deferredInput = compactStepInput({
    inputResponses: leftoverResponses,
    context: deferTurnInput ? stepInput?.context : undefined,
    message: deferTurnInput ? stepInput?.message : undefined,
  });
  const clientContext = readClientContext(stepInput);
  if (deferTurnInput && (clientContext?.length ?? 0) > 0)
    attachClientContext(deferredInput, clientContext);
  return {
    kind: "resolve",
    batches: ready,
    responses,
    consumedMessage: stepInput?.messageConsumed,
    deferredInput: Object.keys(deferredInput).length > 0 ? deferredInput : undefined,
    deferredMessage: deferredInput.message !== undefined ? true : undefined,
    deferredContext:
      deferredInput.context !== undefined || readClientContext(deferredInput) !== undefined
        ? true
        : undefined,
  };
}

function classifyInputBatch(batch: PendingInputBatch): InputBatch {
  for (const request of batch.requests) {
    switch (request.kind) {
      case "question":
      case "session-limit":
      case "tool-approval":
        break;
      default: {
        const unhandled: never = request.kind;
        throw new TypeError(`Unhandled pending input request kind: ${String(unhandled)}`);
      }
    }
  }
  const hasLimit = batch.requests.some((request) => request.kind === "session-limit");
  if (hasLimit && batch.requests.some((request) => request.kind !== "session-limit")) {
    throw new TypeError(
      "Session-limit pending input batches must contain only session-limit requests.",
    );
  }
  return {
    batch,
    kind: hasLimit
      ? "session-limit"
      : batch.requests.some(isApprovalRequest)
        ? "approval"
        : "question",
  };
}

function canonicalizeInputResponses(responses: readonly InputResponse[]): readonly InputResponse[] {
  const byRequestId = new Map<string, InputResponse>();
  for (const response of responses) byRequestId.set(response.requestId, response);
  return [...byRequestId.values()];
}

function resolveTextMessageInput(
  pendingBatch: PendingInputBatch,
  stepInput: StepInput | undefined,
): ResolvedStepInput | undefined {
  if (typeof stepInput?.message !== "string") return stepInput;

  const batchRequestIds = new Set(pendingBatch.requests.map((request) => request.requestId));
  if (stepInput.inputResponses?.some((response) => batchRequestIds.has(response.requestId))) {
    return stepInput;
  }

  const responseAuthRequired = new Set(pendingBatch.responseAuthRequiredRequestIds ?? []);
  const textRequests = pendingBatch.requests.filter(
    (request) => !responseAuthRequired.has(request.requestId),
  );
  const responses = resolveTextToResponses(stepInput.message, textRequests);
  if (responses.length === 0) return stepInput;

  return compactStepInput({
    ...stepInput,
    inputResponses: [...(stepInput.inputResponses ?? []), ...responses],
    messageConsumed: true,
    message: undefined,
  });
}
