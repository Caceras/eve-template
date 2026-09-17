import { cancelRun, getWorld } from "#internal/workflow/runtime.js";
import type { SessionTaskIndexEntry } from "#tasks/session-index.js";
import { cancelWorkflowToolRun } from "#execution/tools/workflow/cancel.js";
import { readWorkflowToolExecutorAddress } from "#execution/tools/workflow/types.js";

export interface TaskExecutorCancelContext {
  readonly entry: SessionTaskIndexEntry;
  readonly serializedContext?: Record<string, unknown>;
  readonly session?: unknown;
}

export type TaskExecutorCancel = (input: TaskExecutorCancelContext) => Promise<void>;

const TASK_RUN_CANCEL_GRACE_MS = 1_000;

/** Cancels task-owned work and reports whether the lifecycle run was forcibly stopped. */
export async function cancelTaskOwnedWork(
  input: TaskExecutorCancelContext & { readonly cancelOwnedWork?: TaskExecutorCancel },
): Promise<boolean> {
  const workflowToolRun = readWorkflowToolExecutorAddress(input.entry.executor);
  if (workflowToolRun !== undefined) {
    await cancelWorkflowToolRun(workflowToolRun, `Task ${input.entry.taskId} was cancelled.`);
  }
  await input.cancelOwnedWork?.(input);
  const world = await getWorld();
  if (await waitForTaskRun(world, input.entry.taskRunId)) return false;
  try {
    await cancelRun(world, input.entry.taskRunId, {
      cancelReason: `Task ${input.entry.taskId} was cancelled.`,
    });
  } catch {
    // The merged task run may have completed during its cooperative unwind.
  }
  return true;
}

/** Native bounded long polling avoids status reads while an executor unwinds. */
async function waitForTaskRun(
  world: Awaited<ReturnType<typeof getWorld>>,
  runId: string,
): Promise<boolean> {
  const controller = new AbortController();
  const deadline = Date.now() + TASK_RUN_CANCEL_GRACE_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        let delayMs = 50;
        while (!controller.signal.aborted && Date.now() < deadline) {
          try {
            const run =
              world.runs.waitForTerminalStatus === undefined
                ? await world.runs.get(runId, { resolveData: "none" })
                : await world.runs.waitForTerminalStatus(runId, {
                    resolveData: "none",
                    signal: controller.signal,
                    timeoutMs: Math.max(0, deadline - Date.now()),
                  });
            if (run.status !== "pending" && run.status !== "running") return true;
          } catch {
            return true;
          }
          // Worlds may return early or omit the optional wait capability.
          const remaining = deadline - Date.now();
          if (controller.signal.aborted || remaining <= 0) return false;
          await new Promise((resolve) => setTimeout(resolve, Math.min(delayMs, remaining)));
          delayMs = Math.min(delayMs * 2, 250);
        }
        return false;
      })(),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), TASK_RUN_CANCEL_GRACE_MS);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
