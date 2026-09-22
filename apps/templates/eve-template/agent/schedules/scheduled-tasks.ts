import { defineSchedule } from "eve/schedules";
import { operatorAuth } from "@/lib/operator";
import { claimDue, completeRun, releaseRun } from "@/lib/schedule-store";
import { readTelegram } from "@/lib/telegram-settings";
import telegram from "../channels/telegram";

// Dispatcher for operator-created tasks (eve's dynamic-scheduling pattern):
// every minute, lease due rows and start a Telegram session for each.
export default defineSchedule({
  cron: "* * * * *",
  run({ to, waitUntil }) {
    waitUntil(
      (async () => {
        const config = await readTelegram().catch(() => undefined);
        // Tasks wait, rather than fail, until Telegram is linked.
        if (!config?.owner) return;
        const jobs = await claimDue({ now: new Date(), limit: 10, leaseForMs: 5 * 60_000 });
        await Promise.all(
          jobs.map(async (job) => {
            try {
              await to(telegram, { chatId: config.owner!.chatId }).send(
                [
                  `Scheduled task "${job.title}" is due now. Carry it out and send the user the result.`,
                  job.prompt,
                ].join("\n\n"),
                { auth: operatorAuth("schedule", { schedule_id: job.id }) },
              );
              await completeRun(job);
            } catch (error) {
              console.error("[scheduled-tasks] dispatch failed", { id: job.id, error });
              await releaseRun(job);
            }
          }),
        );
      })(),
    );
  },
});
