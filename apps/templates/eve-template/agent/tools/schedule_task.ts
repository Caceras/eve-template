import { defineTool } from "eve/tools";
import { z } from "zod";
import { DEFAULT_TIMEZONE, createTask } from "@/lib/schedule-store";
import { deviceCount } from "@/lib/push-notifications";
import { operatorOnly } from "../lib/operator-only";

export default defineTool({
  description: `Schedule a task that Ægentica runs later: a reminder, a daily brief, a recurring check. Each run becomes a conversation in the user's Ægentica history with a notification on their installed devices. Use cron for recurring tasks (5 fields, evaluated in timezone) or runAt for one time. Timezone defaults to ${DEFAULT_TIMEZONE}. Write prompt as instructions to your future self, including what to send.`,
  inputSchema: z.object({
    title: z.string().min(1).max(120).describe("Short name shown in lists, e.g. 'Morning brief'."),
    prompt: z
      .string()
      .min(1)
      .max(4000)
      .describe("What to do and send when the task runs, e.g. 'Remind me to call Anna.'"),
    cron: z
      .string()
      .max(100)
      .nullable()
      .default(null)
      .describe("Recurring schedule such as '0 8 * * 1-5' (weekdays 08:00). Null for one-time."),
    runAt: z
      .string()
      .max(40)
      .nullable()
      .default(null)
      .describe("One-time run as ISO 8601 with offset, e.g. '2026-09-23T08:00:00+02:00'."),
    timezone: z.string().max(60).optional().describe("IANA time zone, e.g. 'Europe/Stockholm'."),
  }),
  approval: operatorOnly,
  async execute(input) {
    const task = await createTask(input);
    const devices = await deviceCount().catch(() => 0);
    return {
      task,
      delivery:
        devices > 0
          ? "A new conversation in Ægentica plus a notification on the user's devices."
          : "A new conversation in Ægentica. Notifications are off; the user can turn them on in Settings.",
    };
  },
});
