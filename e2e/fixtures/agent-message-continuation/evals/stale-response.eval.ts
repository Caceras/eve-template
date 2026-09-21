import { defineEval } from "eve/evals";
import {
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  expectToolResult,
  ownerOf,
  requestFrom,
} from "./helpers.ts";

export default defineEval({
  description:
    "A repeated answer becomes new input and must get a reply without authorizing an old change.",
  async test(t) {
    const first = await t.send("Prepare change A.");
    const approvalA = requestFrom(first, "change-a");
    const session = first.session;
    const second = await session.send("Prepare change B, then acknowledge my decision.");
    const approvalB = requestFrom(second, "change-b");
    const cancelB = [{ requestId: approvalB.requestId, optionId: "cancel" }];
    await expectReply(
      t,
      await session.startRespond(cancelB),
      "Change B resolved.",
      ownerOf(second),
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
