import { defineEval } from "eve/evals";
import {
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  requestFrom,
  expectToolResult,
} from "./helpers.ts";

export default defineEval({
  description: "An older approval cannot silence confirmation of a completed write.",
  async test(t) {
    const parked = await t.send("Prepare change A.");
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;

    const live = await session.start("Save the draft and report how many times it was written.");
    await expectToolResult(t, live, "save-draft");
    const turn = await expectReply(t, live, 'Draft saved: {"writes":1}.');
    turn.calledTool("save-draft", { status: "completed", count: 1 });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
  },
});
