import { defineEval } from "eve/evals";
import {
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  requestFrom,
  expectToolResult,
} from "./helpers.ts";

export default defineEval({
  description:
    "The model must be able to correct invalid tool input while an older approval waits.",
  async test(t) {
    const parked = await t.send("Prepare change A.");
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;

    const live = await session.start(
      "Try a numeric draft ID, then correct it and read the status.",
    );
    await expectToolResult(t, live, "read-draft");
    const turn = await expectReply(t, live, "Draft status: ready.");
    turn.calledTool("read-draft", { status: "failed", count: 1 });
    turn.calledTool("read-draft", {
      status: "completed",
      input: { draftId: "draft-3494" },
      count: 1,
    });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
  },
});
