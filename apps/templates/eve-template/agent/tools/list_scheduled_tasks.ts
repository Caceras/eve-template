import { defineTool } from "eve/tools";
import { z } from "zod";
import { listTasks } from "@/lib/schedule-store";
import { operatorOnly } from "../lib/operator-only";

export default defineTool({
  description:
    "List the user's scheduled tasks with their schedule, next run and last result. List before changing an ambiguous task.",
  inputSchema: z.object({}),
  approval: operatorOnly,
  async execute() {
    return { tasks: await listTasks() };
  },
});
