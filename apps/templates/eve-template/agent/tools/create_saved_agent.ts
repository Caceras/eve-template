import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { profileInput, saveProfile } from "@/lib/agent-profiles";
import { isOperator } from "@/lib/operator";
export default defineTool({
  description:
    "Create a saved agent profile with instructions, reference context, a preferred model and reasoning effort. Show the profile to the operator for approval. Does not install code, connect services or grant new permissions. Existing profiles must be edited in the Agents page.",
  inputSchema: profileInput,
  approval: always(),
  async execute(input, ctx) {
    if (!isOperator(ctx.session.auth.current)) throw new Error("Operator access is required.");
    const { id, name, description } = await saveProfile(input);
    return { id, name, description, url: "/agents" };
  },
});
