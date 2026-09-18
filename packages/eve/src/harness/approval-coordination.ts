import type { ModelMessage } from "ai";

import {
  assertUniqueCoordinationCallIds,
  getPendingCoordinationBatch,
  setPendingCoordinationBatch,
  type PendingCoordinationBatch,
} from "#harness/coordination.js";
import { getPendingInputBatches } from "#harness/pending-input-batches.js";
import type { HarnessSession, SessionStateMap } from "#harness/types.js";
import type {
  RuntimeToolCallActionRequest,
  RuntimeWorkflowTaskRequest,
} from "#shared/action-types.js";

const PENDING_APPROVAL_COORDINATION_BATCHES_KEY = "eve.runtime.pendingApprovalCoordinationBatches";

/** Returns coordination batches withheld until their matching approvals settle. */
export function getPendingApprovalCoordinationBatches(
  state: SessionStateMap | undefined,
): readonly PendingCoordinationBatch[] {
  const value = state?.[PENDING_APPROVAL_COORDINATION_BATCHES_KEY];
  if (!Array.isArray(value)) return [];

  return value.filter((entry): entry is PendingCoordinationBatch => {
    if (typeof entry !== "object" || entry === null) return false;
    const batch = entry as PendingCoordinationBatch;
    return (
      Array.isArray(batch.runtimeActions) &&
      Array.isArray(batch.tasks) &&
      Array.isArray(batch.responseMessages) &&
      typeof batch.event === "object" &&
      batch.event !== null
    );
  });
}

function setPendingApprovalCoordinationBatches(
  session: HarnessSession,
  batches: readonly PendingCoordinationBatch[],
): HarnessSession {
  const state = { ...session.state };
  if (batches.length === 0) {
    delete state[PENDING_APPROVAL_COORDINATION_BATCHES_KEY];
  } else {
    state[PENDING_APPROVAL_COORDINATION_BATCHES_KEY] = batches.map((batch) => ({
      runtimeActions: [...batch.runtimeActions],
      tasks: [...batch.tasks],
      event: batch.event,
      localFanoutSize: batch.localFanoutSize,
      responseMessages: [...batch.responseMessages],
    }));
  }
  return { ...session, state: Object.keys(state).length > 0 ? state : undefined };
}

/** Stores coordination that must not dispatch before approval settles. */
export function appendPendingApprovalCoordinationBatch(input: {
  readonly runtimeActions: readonly RuntimeToolCallActionRequest[];
  readonly tasks: readonly RuntimeWorkflowTaskRequest[];
  readonly event: PendingCoordinationBatch["event"];
  readonly localFanoutSize?: number;
  readonly responseMessages: readonly ModelMessage[];
  readonly session: HarnessSession;
}): HarnessSession {
  const batch = {
    runtimeActions: [...input.runtimeActions],
    tasks: [...input.tasks],
    event: input.event,
    localFanoutSize: input.localFanoutSize,
    responseMessages: [...input.responseMessages],
  } satisfies PendingCoordinationBatch;
  const existing = getPendingApprovalCoordinationBatches(input.session.state);
  assertUniqueCoordinationCallIds([...batch.runtimeActions, ...batch.tasks]);
  return setPendingApprovalCoordinationBatches(input.session, [...existing, batch]);
}

/** Removes approval-blocked coordination requests rejected before dispatch. */
export function removePendingApprovalCoordinationRequests(
  session: HarnessSession,
  rejections: readonly {
    readonly event: PendingCoordinationBatch["event"];
    readonly results: readonly { readonly callId: string }[];
  }[],
): HarnessSession {
  if (rejections.length === 0) return session;
  const batches = getPendingApprovalCoordinationBatches(session.state);
  let changed = false;
  const filtered = batches.flatMap((batch) => {
    const callIds = new Set(
      rejections
        .filter(
          ({ event }) =>
            event.sequence === batch.event.sequence &&
            event.stepIndex === batch.event.stepIndex &&
            event.turnId === batch.event.turnId,
        )
        .flatMap(({ results }) => results.map((result) => result.callId)),
    );
    const runtimeActions = batch.runtimeActions.filter((request) => !callIds.has(request.callId));
    const tasks = batch.tasks.filter((request) => !callIds.has(request.callId));
    changed ||= runtimeActions.length !== batch.runtimeActions.length;
    changed ||= tasks.length !== batch.tasks.length;
    return runtimeActions.length === 0 && tasks.length === 0
      ? []
      : [{ ...batch, runtimeActions, tasks }];
  });
  return changed ? setPendingApprovalCoordinationBatches(session, filtered) : session;
}

/** Promotes the first blocked batch whose matching approval is no longer pending. */
export function promoteApprovedCoordinationBatch(session: HarnessSession): HarnessSession {
  if (getPendingCoordinationBatch(session.state) !== undefined) return session;

  const batches = getPendingApprovalCoordinationBatches(session.state);
  const readyIndex = batches.findIndex((batch) => !hasMatchingPendingApproval(session, batch));
  if (readyIndex < 0) return session;

  const batch = batches[readyIndex];
  if (batch === undefined) return session;
  const remaining = batches.filter((_, index) => index !== readyIndex);
  return setPendingCoordinationBatch({
    runtimeActions: batch.runtimeActions,
    tasks: batch.tasks,
    event: batch.event,
    localFanoutSize: batch.localFanoutSize,
    responseMessages: batch.responseMessages,
    session: setPendingApprovalCoordinationBatches(session, remaining),
  });
}

function hasMatchingPendingApproval(
  session: HarnessSession,
  batch: PendingCoordinationBatch,
): boolean {
  const callIds = new Set(
    [...batch.runtimeActions, ...batch.tasks].map((request) => request.callId),
  );
  return getPendingInputBatches(session.state).some(
    (inputBatch) =>
      inputBatch.event !== undefined &&
      inputBatch.event.sequence === batch.event.sequence &&
      inputBatch.event.stepIndex === batch.event.stepIndex &&
      inputBatch.event.turnId === batch.event.turnId &&
      inputBatch.requests.some(
        (request) => request.kind === "tool-approval" && callIds.has(request.action.callId),
      ),
  );
}
