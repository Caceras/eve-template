import { defineEval } from "eve/evals";
import {
  scriptedSession,
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectResponseReply,
  expectToolResult,
  requestFrom,
} from "./helpers.ts";

export default defineEval({
  description:
    "cancel-sibling: resolving the current request must finish its work while change A still waits.",
  timeoutMs: 60_000,
  async test(t) {
    const first = await t.send("Prepare change A.", scriptedSession);
    const approvalA = requestFrom(first, "change-a");
    const session = first.session;
    const second = await session.send("Prepare change B, then read the draft status.");
    const current = requestFrom(second, "change-b");

    const live = await session.startRespond([{ requestId: current.requestId, optionId: "cancel" }]);
    await expectToolResult(t, live, "read-draft");
    const reply = await expectResponseReply(t, live, "Draft status: ready.", current.requestId);
    reply.notEvent("action.result", {
      data: { status: "completed", result: { toolName: "change-b" } },
    });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approvalA);
  },
});
