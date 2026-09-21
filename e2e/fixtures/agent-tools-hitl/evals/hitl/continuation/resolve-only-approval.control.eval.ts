import { defineEval } from "eve/evals";
import { scriptedSession, expectResponseReply, requestFrom } from "./helpers.ts";

export default defineEval({
  description: "Control: resolving the only approval runs its tool, reads the status, and replies.",
  timeoutMs: 60_000,
  async test(t) {
    const parked = await t.send("Prepare change B, then read the draft status.", scriptedSession);
    const approval = requestFrom(parked, "change-b");
    const live = await parked.session.startRespond([
      { requestId: approval.requestId, optionId: "approve" },
    ]);
    const reply = await expectResponseReply(t, live, "Draft status: ready.", approval.requestId);
    reply.calledTool("change-b", { status: "completed", output: { executions: 1 }, count: 1 });
    reply.calledTool("read-draft", { status: "completed", count: 1 });
  },
});
