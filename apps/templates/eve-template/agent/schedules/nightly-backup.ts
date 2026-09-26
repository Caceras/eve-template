import { defineSchedule } from "eve/schedules";
import { isBackupDue, runBackup } from "@/lib/backup";

let running = false;

// Nightly on-volume backup of chats, memory and settings (lib/backup.ts), kept
// seven nights. Nitro evaluates cron in the container's clock (UTC), so the
// schedule checks hourly and the backup runs once the task time zone
// (AEGENTICA_TIMEZONE, Europe/Stockholm) reaches 03:17, whatever daylight
// saving says. A night the container was down catches up at the next check.
export default defineSchedule({
  cron: "17 * * * *",
  run({ waitUntil }) {
    if (running) return;
    running = true;
    waitUntil(
      (async () => {
        if (!(await isBackupDue(new Date()))) return;
        const result = await runBackup();
        const summary = { day: result.day, files: result.files, removed: result.removed };
        if (result.failed.length > 0)
          console.error("[nightly-backup] incomplete; older backups kept", {
            ...summary,
            failed: result.failed,
          });
        else console.log("[nightly-backup] saved", summary);
      })()
        .catch((error) => console.error("[nightly-backup] failed", error))
        .finally(() => {
          running = false;
        }),
    );
  },
});
