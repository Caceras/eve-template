import { defineTool } from "eve/tools";
import { z } from "zod";
import { updateTask } from "@/lib/schedule-store";
import { operatorConfirms, operatorOnly } from "../lib/operator-only";

/** What a task does and when it runs unattended: changing these needs the operator's confirmation. */
const REWRITES = ["prompt", "skill", "cron", "runAt", "timezone"] as const;

export default defineTool({
  description:
    "Change, pause or resume one scheduled task. Set enabled false to pause and true to resume. Pausing, resuming and renaming apply at once; changing the instructions, skill, schedule or time zone waits for the user to confirm.",
  inputSchema: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(120).optional(),
    prompt: z.string().min(1).max(4000).optional(),
    skill: z.string().max(64).nullable().optional(),
    cron: z.string().max(100).nullable().optional(),
    runAt: z.string().max(40).nullable().optional(),
    timezone: z.string().max(60).optional(),
    enabled: z.boolean().optional(),
  }),
  approval: (ctx) =>
    REWRITES.some((field) => ctx.toolInput?.[field] !== undefined)
      ? operatorConfirms(ctx)
      : operatorOnly(ctx),
  async execute({ id, ...patch }) {
    return { task: await updateTask(id, patch) };
  },
});
