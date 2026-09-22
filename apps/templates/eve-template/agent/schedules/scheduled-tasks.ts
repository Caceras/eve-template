import { defineSchedule } from "eve/schedules";
import { claimDue, completeRun, releaseRun } from "@/lib/schedule-store";
import { runScheduledTask } from "@/lib/task-runner";

// Dispatcher for operator-created tasks (eve's dynamic-scheduling pattern):
// every minute, lease due rows and run each one as a chat in the web app.
export default defineSchedule({
  cron: "* * * * *",
  run({ waitUntil }) {
    waitUntil(
      (async () => {
        const jobs = await claimDue({ now: new Date(), limit: 5, leaseForMs: 15 * 60_000 });
        await Promise.all(
          jobs.map(async (job) => {
            try {
              await completeRun(job, await runScheduledTask(job));
            } catch (error) {
              console.error("[scheduled-tasks] run failed", { id: job.id, error });
              await releaseRun(job);
            }
          }),
        );
      })(),
    );
  },
});
