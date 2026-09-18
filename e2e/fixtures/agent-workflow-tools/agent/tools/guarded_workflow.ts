import { defineWorkflowTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

export default defineWorkflowTool({
  approval: always(),
  description: "Report workflow execution only after approval.",
  inputSchema: z.strictObject({ service: z.string() }),
  async *execute({ service }) {
    "use workflow";

    yield "WORKFLOW-GUARDED-EXECUTING";
    return { service, result: "WORKFLOW-GUARDED-COMPLETE" };
  },
});
