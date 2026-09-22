import { defineTool } from "eve/tools";
import { z } from "zod";
import { updateTask } from "@/lib/schedule-store";
import { operatorOnly } from "../lib/operator-only";

export default defineTool({
  description:
    "Change, pause or resume one scheduled task. Set enabled false to pause and true to resume.",
  inputSchema: z.object({
    id: z.string().uuid(),
    title: z.string().min(1).max(120).optional(),
    prompt: z.string().min(1).max(4000).optional(),
    cron: z.string().max(100).nullable().optional(),
    runAt: z.string().max(40).nullable().optional(),
    timezone: z.string().max(60).optional(),
    enabled: z.boolean().optional(),
  }),
  approval: operatorOnly,
  async execute({ id, ...patch }) {
    return { task: await updateTask(id, patch) };
  },
});
