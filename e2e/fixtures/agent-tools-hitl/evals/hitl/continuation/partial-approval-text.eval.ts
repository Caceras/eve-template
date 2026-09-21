import { defineEval } from "eve/evals";
import {
  scriptedSession,
  expectChangeStillUnexecuted,
  expectReply,
  requestFrom,
  submitPartialApproval,
} from "./helpers.ts";

export default defineEval({
  description:
    "A partial approval must not prevent a new text-only message from receiving a completed reply.",
  tags: ["hitl", "continuation", "regression", "user-message", "partial-approval"],
  timeoutMs: 60_000,
  async test(t) {
    // Given A and B were requested together and only A has an accepted approval response.
    const parked = await t.send("Prepare changes A and B together.", scriptedSession);
    const approvalA = requestFrom(parked, "change-a");
    const approvalB = requestFrom(parked, "change-b");
    const session = parked.session;
    await submitPartialApproval(t, session, approvalA);

    // When the user asks what is waiting without requesting tools.
    const live = await session.start("Explain what is waiting, without calling any tools.");

    // Then the text reply completes; the batch stays unexecuted until B is approved.
    await expectReply(t, live, "Your changes are waiting for approval.");
    expectChangeStillUnexecuted(session, "change-a");
    expectChangeStillUnexecuted(session, "change-b");

    const approved = await session.respond([
      { requestId: approvalB.requestId, optionId: "approve" },
    ]);
    approved.calledTool("change-a", { status: "completed", output: { executions: 1 }, count: 1 });
    approved.calledTool("change-b", { status: "completed", output: { executions: 1 }, count: 1 });
  },
});
