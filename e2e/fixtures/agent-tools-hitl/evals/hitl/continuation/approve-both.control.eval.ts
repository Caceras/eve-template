import { defineEval } from "eve/evals";
import { scriptedSession, expectResponseReply, requestFrom } from "./helpers.ts";

export default defineEval({
  description: "Control: approving both calls together executes each once and completes the reply.",
  timeoutMs: 60_000,
  async test(t) {
    const parked = await t.send("Prepare changes A and B together.", scriptedSession);
    const approvalA = requestFrom(parked, "change-a");
    const approvalB = requestFrom(parked, "change-b");
    const live = await parked.session.startRespond([
      { requestId: approvalA.requestId, optionId: "approve" },
      { requestId: approvalB.requestId, optionId: "approve" },
    ]);
    const reply = await expectResponseReply(t, live, "Both changes resolved.", approvalB.requestId);
    reply.calledTool("change-a", { status: "completed", output: { executions: 1 }, count: 1 });
    reply.calledTool("change-b", { status: "completed", output: { executions: 1 }, count: 1 });
  },
});
