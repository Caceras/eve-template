import { defineEval } from "eve/evals";
import {
  scriptedSession,
  expectChangeStillUnexecuted,
  expectReply,
  expectToolResult,
  requestFrom,
  submitPartialApproval,
} from "./helpers.ts";

export default defineEval({
  description:
    "A partial approval must not prevent a new tool message from receiving a completed reply.",
  timeoutMs: 60_000,
  async test(t) {
    const parked = await t.send("Prepare changes A and B together.", scriptedSession);
    const approvalA = requestFrom(parked, "change-a");
    const approvalB = requestFrom(parked, "change-b");
    const session = parked.session;
    await submitPartialApproval(t, session, approvalA);

    const live = await session.start("Read the draft status.");
    await expectToolResult(t, live, "read-draft");
    await expectReply(t, live, "Draft status: ready.");
    expectChangeStillUnexecuted(session, "change-a");
    expectChangeStillUnexecuted(session, "change-b");

    const approved = await session.respond([
      { requestId: approvalB.requestId, optionId: "approve" },
    ]);
    approved.calledTool("change-a", { status: "completed", output: { executions: 1 }, count: 1 });
    approved.calledTool("change-b", { status: "completed", output: { executions: 1 }, count: 1 });
  },
});
