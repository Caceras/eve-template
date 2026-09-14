import type { HookPayload } from "#channel/types.js";
import type { DurableSessionState } from "#execution/durable-session-store.js";
import { getSessionTaskCohorts } from "#tasks/session-task-cohorts.js";

export interface CallerTaskResults {
  readonly deliveredTaskIds: Set<string>;
  readonly taskIds: Set<string>;
}

export function createCallerTaskResults(): CallerTaskResults {
  return { deliveredTaskIds: new Set(), taskIds: new Set() };
}

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

export function hasPendingCallerTaskResults(results: CallerTaskResults): boolean {
  return (
    results.taskIds.size > 0 &&
    [...results.taskIds].some((taskId) => !results.deliveredTaskIds.has(taskId))
  );
}

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
