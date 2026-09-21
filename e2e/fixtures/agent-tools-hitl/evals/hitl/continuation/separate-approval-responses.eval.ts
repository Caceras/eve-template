import { defineEval } from "eve/evals";
import {
  scriptedSession,
  expectResponseReply,
  requestFrom,
  submitPartialApproval,
} from "./helpers.ts";

export default defineEval({
  description:
    "Separate authenticated responses must accumulate until both approvals from one batch are answered.",
  timeoutMs: 60_000,
  async test(t) {
    const parked = await t.send("Prepare changes A and B together.", scriptedSession);
    const approvalA = requestFrom(parked, "change-a");
    const approvalB = requestFrom(parked, "change-b");
    const session = parked.session;
    await submitPartialApproval(t, session, approvalA);
    const live = await session.startRespond([
      { requestId: approvalB.requestId, optionId: "approve" },
    ]);
    const reply = await expectResponseReply(t, live, "Both changes resolved.", approvalB.requestId);
    reply.calledTool("change-a", { status: "completed", output: { executions: 1 }, count: 1 });
    reply.calledTool("change-b", { status: "completed", output: { executions: 1 }, count: 1 });
  },
});
