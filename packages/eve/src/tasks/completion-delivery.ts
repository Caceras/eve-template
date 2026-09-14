import type { DeliverHookPayload } from "#channel/types.js";
import type { getSessionTaskCohorts } from "#tasks/session-task-cohorts.js";

type TaskCohorts = ReturnType<typeof getSessionTaskCohorts>;

/** Decodes the existing transport identity once, outside invocation completion. */
export function readTaskCompletion(
  delivery: DeliverHookPayload,
): { readonly taskId: string; readonly status: "completed" | "failed" | "cancelled" } | undefined {
  for (const status of ["completed", "failed", "cancelled"] as const) {
    const suffix = `:ready:${status}`;
    if (delivery.taskDeliveryId?.endsWith(suffix)) {
      return { taskId: delivery.taskDeliveryId.slice(0, -suffix.length), status };
    }
  }
  return undefined;
}

/** A terminal delivery carries its own result; siblings come from the dispatch snapshot. */
export function deliveredTaskResultIds(
  taskId: string | undefined,
  cohorts: TaskCohorts,
): readonly string[] {
  if (taskId === undefined) return [];
  const delivered = cohorts.get(taskId);
  if (delivered === undefined) return [taskId];
  return [
    taskId,
    ...[...cohorts].flatMap(([id, task]) =>
      id !== taskId && task.settled && task.cohortId === delivered.cohortId ? [id] : [],
    ),
  ];
}

/** Batching controls when synthesis runs; it does not settle an invocation. */
export function pendingCompletionGroups(input: {
  readonly cohorts: TaskCohorts;
  readonly completedTaskIds: ReadonlySet<string>;
  readonly cancelledTaskIds: ReadonlySet<string>;
  readonly release: "all" | "available";
}): ReadonlySet<string> {
  const pending = new Set<string>();
  if (input.release === "available") return pending;
  for (const [taskId, task] of input.cohorts) {
    if (
      !task.settled &&
      !input.completedTaskIds.has(taskId) &&
      !input.cancelledTaskIds.has(taskId)
    ) {
      pending.add(task.cohortId);
    }
  }
  return pending;
}
