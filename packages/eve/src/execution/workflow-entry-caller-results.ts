import type { HookPayload } from "#channel/types.js";
import type { DurableSessionState } from "#execution/durable-session-store.js";
import { getSessionTaskCohorts } from "#tasks/session-task-cohorts.js";

export interface CallerTaskResults {
  readonly deliveredTaskIds: Set<string>;
  readonly taskIds: Set<string>;
}

/** Starts caller-scoped tracking so workflow-entry can defer settlement for turn-owned tasks. */
export function createCallerTaskResults(): CallerTaskResults {
  return { deliveredTaskIds: new Set(), taskIds: new Set() };
}

/** Preserves the caller until terminal deliveries cover the dispatched turn's task cohort. */
export function observeCallerTaskResults(input: {
  readonly delivery: HookPayload;
  readonly results: CallerTaskResults;
  readonly sessionState: DurableSessionState;
  readonly turnId: string;
}): void {
  const taskCohorts = getSessionTaskCohorts(input.sessionState.snapshot?.session.state);
  for (const [taskId, task] of taskCohorts) {
    if (task.createdByTurnId === input.turnId) input.results.taskIds.add(taskId);
  }

  const taskId = terminalTaskDeliveryId(input.delivery);
  if (taskId === undefined) return;
  const deliveredTask = taskCohorts.get(taskId);
  if (deliveredTask?.settled !== true) return;

  for (const [candidateId, candidate] of taskCohorts) {
    if (
      input.results.taskIds.has(candidateId) &&
      candidate.settled &&
      candidate.cohortId === deliveredTask.cohortId
    ) {
      input.results.deliveredTaskIds.add(candidateId);
    }
  }
}

/** Tells workflow-entry whether the current caller must remain parked for an outstanding result. */
export function hasPendingCallerTaskResults(results: CallerTaskResults): boolean {
  return (
    results.taskIds.size > 0 &&
    [...results.taskIds].some((taskId) => !results.deliveredTaskIds.has(taskId))
  );
}

/** Ends caller-scoped tracking so a later caller cannot inherit prior delivery obligations. */
export function clearCallerTaskResults(results: CallerTaskResults): void {
  results.taskIds.clear();
  results.deliveredTaskIds.clear();
}

function terminalTaskDeliveryId(delivery: HookPayload): string | undefined {
  if (delivery.kind !== "deliver") return undefined;
  for (const status of ["completed", "failed", "cancelled"] as const) {
    const suffix = `:ready:${status}`;
    if (delivery.taskDeliveryId?.endsWith(suffix)) {
      return delivery.taskDeliveryId.slice(0, -suffix.length);
    }
  }
  return undefined;
}
