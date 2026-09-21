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
    "Starting a background task must produce an acknowledgement while an older approval waits.",
  async test(t) {
    const parked = await t.send("Prepare change A.");
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;

    const live = await session.start("Start the background draft and acknowledge its receipt.");
    await expectToolResult(t, live, "background-draft");
    const turn = await expectReply(t, live, /^Background receipt: .*"status":"working"/);
    turn.calledTool("background-draft", { count: 1 });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
    await session.cancel();
  },
});
