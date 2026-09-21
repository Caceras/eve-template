import { defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";

export default defineTool({
  description: "Apply a change only after the fixture's authorized user approves it.",
  inputSchema: z.object({}),
  approval: {
    request: always(),
    response: ({ responder }) =>
      responder.principalId === "e2e-approval-responder"
        ? { status: "allowed" }
        : { status: "rejected", reason: "Wrong responder." },
  },
  async execute() {
    return { change: "authorized", executions: 1 };
  },
});
