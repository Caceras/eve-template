import { defineSchedule } from "eve/schedules";

import { gmail } from "../channels/gmail";

export default defineSchedule({
  cron: "8 17 * * *",
  async run() {
    await gmail.watch();
    await gmail.sync();
  },
});
