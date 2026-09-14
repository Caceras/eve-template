import type { HookPayload } from "#channel/types.js";
import type { DurableSessionState } from "#execution/durable-session-store.js";
import { getSessionTaskCohorts } from "#tasks/session-task-cohorts.js";

/** Task-result obligations owned by one externally initiated invocation. */
export interface InvocationTasks {
  readonly deliveredTaskIds: Set<string>;
  readonly taskIds: Set<string>;
}

/** Starts invocation-scoped tracking for tasks created by its turns. */
export function createInvocationTasks(): InvocationTasks {
  return { deliveredTaskIds: new Set(), taskIds: new Set() };
}

/** Records tasks created by the dispatched turn and terminal task deliveries for its cohort. */
export function observeInvocationTasks(input: {
  readonly delivery: HookPayload;
  readonly invocation: InvocationTasks;
  readonly sessionState: DurableSessionState;
  readonly turnId: string;
}): void {
  const taskCohorts = getSessionTaskCohorts(input.sessionState.snapshot?.session.state);
  for (const [taskId, task] of taskCohorts) {
    if (task.createdByTurnId === input.turnId) input.invocation.taskIds.add(taskId);
  }

  const taskId = terminalTaskDeliveryId(input.delivery);
  if (taskId === undefined) return;
  const deliveredTask = taskCohorts.get(taskId);
  if (deliveredTask?.settled !== true) return;

  for (const [candidateId, candidate] of taskCohorts) {
    if (
      input.invocation.taskIds.has(candidateId) &&
      candidate.settled &&
      candidate.cohortId === deliveredTask.cohortId
    ) {
      input.invocation.deliveredTaskIds.add(candidateId);
    }
  }
}

/** Reports whether the invocation still owes at least one terminal task delivery. */
export function hasPendingInvocationTasks(invocation: InvocationTasks): boolean {
  return (
    invocation.taskIds.size > 0 &&
    [...invocation.taskIds].some((taskId) => !invocation.deliveredTaskIds.has(taskId))
  );
}

/** Clears task obligations before the tracker is reused for another invocation. */
export function clearInvocationTasks(invocation: InvocationTasks): void {
  invocation.taskIds.clear();
  invocation.deliveredTaskIds.clear();
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
