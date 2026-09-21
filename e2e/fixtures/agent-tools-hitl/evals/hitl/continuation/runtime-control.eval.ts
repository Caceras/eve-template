import { defineEval } from "eve/evals";
import {
  scriptedSession,
  expectChangeStillUnexecuted,
  expectReply,
  requestFrom,
  expectToolResult,
} from "./helpers.ts";

export default defineEval({
  description: "A task-control result must be interpreted while an older approval waits.",
  timeoutMs: 60_000,
  async test(t) {
    const session = await t.session(scriptedSession);
    await expectReply(
      t,
      await session.start("Start the background draft and acknowledge its receipt."),
      /^Background receipt: .*"status":"working"/,
    );
    const parked = await session.send("Prepare change A.");
    requestFrom(parked, "change-a");

    const live = await session.start("Cancel the background draft task and confirm cancellation.");
    await expectToolResult(t, live, "task_cancel");
    const turn = await expectReply(t, live, /Cancellation result: .*"status":"cancelled"/);
    turn.calledTool("task_cancel", { status: "completed", count: 1 });
    expectChangeStillUnexecuted(session);
  },
});
