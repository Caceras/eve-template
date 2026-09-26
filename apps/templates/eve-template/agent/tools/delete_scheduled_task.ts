import { defineTool } from "eve/tools";
import { z } from "zod";
import { deleteTask } from "@/lib/schedule-store";
import { operatorConfirms } from "../lib/operator-only";

export default defineTool({
  description:
    "Permanently delete one scheduled task. Prefer pausing when the user may want it back.",
  inputSchema: z.object({ id: z.string().uuid() }),
  approval: operatorConfirms,
  async execute({ id }) {
    return { deleted: await deleteTask(id) };
  },
});
