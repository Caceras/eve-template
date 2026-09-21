import { defineEval } from "eve/evals";
import { expectReply, ownerOf, requestFrom, submitPartialApproval } from "./helpers.ts";

export default defineEval({
  description:
    "Control: separate responses accumulate until both approvals from one batch are answered.",
  async test(t) {
    const parked = await t.send("Prepare changes A and B together.");
    const approvalA = requestFrom(parked, "change-a");
    const approvalB = requestFrom(parked, "change-b");
    const session = parked.session;
    await submitPartialApproval(t, session, approvalA);
    const live = await session.startRespond([
      { requestId: approvalB.requestId, optionId: "approve" },
    ]);
    const reply = await expectReply(t, live, "Both changes resolved.", ownerOf(parked));
    reply.calledTool("change-a", { status: "completed", count: 1 });
    reply.calledTool("change-b", { status: "completed", count: 1 });
  },
});
