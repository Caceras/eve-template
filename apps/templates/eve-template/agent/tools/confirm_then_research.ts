import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";

export default defineWorkflowTool({
  description:
    "Demonstrate a blocking durable workflow: ask the human, then delegate approved work to a copy of Ægentica.",
  inputSchema: z.object({
    topic: z.string().min(1),
  }),
  async execute({ topic }, ctx) {
    "use workflow";
    const answer = await ctx.ask({
      prompt: `Run delegated research on “${topic}”?`,
      display: "confirmation",
      options: [
        { id: "approve", label: "Research", style: "primary" },
        { id: "cancel", label: "Cancel" },
      ],
    });

    if (answer.status !== "answered" || answer.optionId !== "approve") {
      return { approved: false };
    }

    const result = await ctx.agent("agent", {
      message: `Research this topic carefully and return a concise evidence-oriented synthesis:\n\n${topic}`,
    });

    return { approved: true, result };
  },
});
