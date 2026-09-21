import { defineEval } from "eve/evals";
import {
  scriptedSession,
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  requestFrom,
  expectToolResult,
} from "./helpers.ts";

export default defineEval({
  description:
    "Starting a background task must produce an acknowledgement while an older approval waits.",
  timeoutMs: 60_000,
  async test(t) {
    const parked = await t.send("Prepare change A.", scriptedSession);
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;

    const live = await session.start("Start the background draft and acknowledge its receipt.");
    await expectToolResult(t, live, "background-draft");
    const turn = await expectReply(t, live, /^Background receipt: .*"status":"working"/);
    turn.calledTool("background-draft", { count: 1 });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
    await expectReply(
      t,
      await session.start("Cancel the background draft task and confirm cancellation."),
      /Cancellation result: .*"status":"cancelled"/,
    );
  },
});
