import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

export default defineWorkflowTool({
  description:
    "Run an independent review in a durable background workflow and report the result back to the parent when it completes.",
  execution: "background",
  inputSchema: z.object({
    subject: z.string().min(1),
  }),
  async execute({ subject }, ctx) {
    "use workflow";
    const result = await ctx.agent("reviewer", {
      message: `Independently review this and return the most important problems, uncertainties, and corrections:\n\n${subject}`,
    });
    return { review: result };
  },
});
