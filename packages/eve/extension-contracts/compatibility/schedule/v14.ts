import { defineSchedule } from "#public/schedules/index.js";

export default defineSchedule({
  cron: "0 9 * * *",
  markdown: "Prepare the daily report.",
});
