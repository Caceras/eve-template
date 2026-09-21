import { defineSchedule } from "eve/schedules";

export default defineSchedule({
  cron: "0 9 * * 1",
  markdown:
    "This is the Eve template schedule demonstration. Reply briefly with the current agent status and do not perform external writes.",
});
