import type { ModelMessage } from "ai";

import type { RuntimeToolResultActionResult } from "#shared/action-types.js";
import type { ResolvedInputBatch } from "#harness/input-request-resolution.js";
import type { PendingInputBatch, PendingInputBatchEvent } from "#harness/pending-input-batches.js";
import type { HarnessSession, StepInput } from "#harness/types.js";
import { attachClientContext, readClientContext } from "#internal/client-context.js";

export type ToolResponsePart = Extract<ModelMessage, { role: "tool" }>["content"][number];

/** Action results from one resolved batch, attributed to their originating turn. */
export interface ResolvedInputActionBatch {
  readonly event: PendingInputBatchEvent;
  readonly results: readonly RuntimeToolResultActionResult[];
}

export type ResolvedStepInput = StepInput & { readonly messageConsumed?: boolean };

export type ResolvePendingInputResult = {
  readonly consumedMessage?: boolean;
  readonly deferredContext?: boolean;
  readonly deferredMessage?: boolean;
  /** Present when a session-limit continuation prompt was resolved. */
  readonly limitContinuation?: { readonly granted: boolean };
  readonly outcome: "resolved" | "continue" | "unresolved";
  readonly messages: ModelMessage[];
  readonly rejectedActions?: readonly ResolvedInputActionBatch[];
  readonly resolvedInputs?: readonly ResolvedInputBatch[];
  readonly session: HarnessSession;
};

export function appendResolvedBatchTranscript(
  messages: ModelMessage[],
  batch: PendingInputBatch,
  toolParts: readonly ToolResponsePart[],
): void {
  messages.push(...batch.responseMessages);
  if (toolParts.length > 0) {
    messages.push({ content: [...toolParts], role: "tool" });
  }
}

export function compactStepInput(input: ResolvedStepInput | undefined): ResolvedStepInput {
  if (input === undefined) {
    return {};
  }

  const result: {
    context?: StepInput["context"];
    inputResponses?: StepInput["inputResponses"];
    message?: StepInput["message"];
    messageConsumed?: boolean;
    outputSchema?: StepInput["outputSchema"];
  } = {};

  if ((input.context?.length ?? 0) > 0) result.context = input.context;
  if ((input.inputResponses?.length ?? 0) > 0) result.inputResponses = input.inputResponses;
  if (input.message !== undefined) result.message = input.message;
  if (input.messageConsumed === true) result.messageConsumed = true;
  if (input.outputSchema !== undefined) result.outputSchema = input.outputSchema;

  return attachClientContext(result, readClientContext(input));
}
