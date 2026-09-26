import { defineSchedule } from "eve/schedules";
import {
  claimDue,
  completeRun,
  recordRunSession,
  releaseRun,
  type ScheduledTask,
} from "@/lib/schedule-store";
import { runScheduledTask } from "@/lib/task-runner";

/** Runs in flight in this process; a long run never holds up the next tick. */
const running = new Set<string>();
const MAX_RUNNING = 4;

async function run(job: ScheduledTask) {
  let result: Awaited<ReturnType<typeof runScheduledTask>>;
  try {
    result = await runScheduledTask(job, {
      onStarted: (sessionId) => recordRunSession(job, sessionId),
    });
  } catch (error) {
    // The session never started: retry it later.
    console.error("[scheduled-tasks] run failed", { id: job.id, error });
    await releaseRun(job).catch((release) =>
      console.error("[scheduled-tasks] could not reschedule", { id: job.id, error: release }),
    );
    return;
  }
  // A run that happened is never retried, even if recording it fails.
  await completeRun(job, result).catch((error) =>
    console.error("[scheduled-tasks] could not record the run", { id: job.id, error }),
  );
}

// Dispatcher for operator-created tasks (eve's dynamic-scheduling pattern):
// every minute, lease due rows and start each one as a chat in the web app.
// Runs are detached from the tick: eve waits for a tick's work before running
// the next one, so awaiting a ten-minute run would delay every other task.
export default defineSchedule({
  cron: "* * * * *",
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        const room = MAX_RUNNING - running.size;
        if (room <= 0) return;
        const jobs = await claimDue({ now: new Date(), limit: room, leaseForMs: 15 * 60_000 });
        for (const job of jobs) {
          running.add(job.id);
          void run(job).finally(() => running.delete(job.id));
        }
      })().catch((error) => console.error("[scheduled-tasks] tick failed", error)),
    );
  },
});
