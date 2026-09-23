import { defineTool } from "eve/tools";
import { z } from "zod";
import { listProfiles } from "@/lib/agent-profiles";
import { isOperator } from "@/lib/operator";
export default defineTool({
  description:
    "List the operator's saved agents for delegation. These are role profiles, not additional permissions or isolated deployments.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    if (!isOperator(ctx.session.auth.current)) throw new Error("Operator access is required.");
    return (await listProfiles()).map(({ id, name, description }) => ({ id, name, description }));
  },
});
