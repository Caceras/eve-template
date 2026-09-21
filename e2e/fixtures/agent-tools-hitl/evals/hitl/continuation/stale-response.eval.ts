import { defineEval } from "eve/evals";
import {
  scriptedSession,
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  expectResponseReply,
  expectToolResult,
  requestFrom,
} from "./helpers.ts";

export default defineEval({
  description:
    "A repeated answer becomes new input and must get a reply without authorizing an old change.",
  timeoutMs: 60_000,
  async test(t) {
    const first = await t.send("Prepare change A.", scriptedSession);
    const approvalA = requestFrom(first, "change-a");
    const session = first.session;
    const second = await session.send("Prepare change B, then acknowledge my decision.");
    const approvalB = requestFrom(second, "change-b");
    const cancelB = [{ requestId: approvalB.requestId, optionId: "cancel" }];
    await expectResponseReply(
      t,
      await session.startRespond(cancelB),
      "Change B resolved.",
      approvalB.requestId,
    );

    const repeated = await session.startRespond(cancelB);
    await expectToolResult(t, repeated, "read-draft");
    await expectReply(t, repeated, "Draft status: ready.");
    expectChangeStillUnexecuted(session, "change-a");
    session.notEvent("action.result", {
      data: { status: "completed", result: { toolName: "change-b" } },
    });
    await approveSavedChange(session, approvalA);
  },
});
