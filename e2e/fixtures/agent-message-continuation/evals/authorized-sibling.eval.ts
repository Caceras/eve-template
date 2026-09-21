import { defineEval } from "eve/evals";
import {
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectResponseReply,
  expectToolResult,
  requestFrom,
} from "./helpers.ts";

export default defineEval({
  description:
    "authorized-sibling: resolving the current request must finish its work while change A still waits.",
  async test(t) {
    const first = await t.send("Prepare change A.");
    const approvalA = requestFrom(first, "change-a");
    const session = first.session;
    const second = await session.send("Prepare an authorized change, then read the draft status.");
    const current = requestFrom(second, "authorized-change");

    const live = await session.startRespond([
      { requestId: current.requestId, optionId: "approve" },
    ]);
    await expectToolResult(t, live, "read-draft");
    const reply = await expectResponseReply(t, live, "Draft status: ready.", current.requestId);
    reply.calledTool("authorized-change", {
      status: "completed",
      output: { executions: 1 },
      count: 1,
    });
    reply.event("approval.settled", {
      data: { requestId: current.requestId, outcome: "approved" },
      count: 1,
    });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approvalA);
  },
});
