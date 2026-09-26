import { defineWorkflowTool, type WorkflowStepToolContext } from "eve/tools";
import { z } from "zod";
import { findProfile, profileInstructions } from "@/lib/agent-profiles";
import { isOperator } from "@/lib/operator";
export default defineWorkflowTool({
  description:
    "Delegate a task to a saved agent profile in the background. Use list_saved_agents for the id. Runs in a copy of Ægentica with all of its skills, tools and connections, the current conversation model and approval rules; not an isolated deployment. The result returns to this conversation.",
  execution: "background",
  inputSchema: z.object({ id: z.string().uuid(), task: z.string().min(1).max(8000) }),
  async execute({ id, task }, ctx) {
    "use workflow";
    const profile = await loadProfile(ctx, id);
    // The root copy inherits every skill, tool and connection; a declared subagent inherits none.
    const result = await ctx.agent("agent", {
      message: `${profile.instructions}\n\nDelegated task:\n${task}`,
    });
    return { agent: profile.name, result };
  },
});
async function loadProfile(ctx: WorkflowStepToolContext, id: string) {
  "use step";
  if (!isOperator(ctx.session.auth.current)) throw new Error("Operator access is required.");
  const profile = await findProfile(id);
  if (!profile) throw new Error("Saved agent not found. List saved agents again.");
  return { name: profile.name, instructions: profileInstructions(profile) };
}
