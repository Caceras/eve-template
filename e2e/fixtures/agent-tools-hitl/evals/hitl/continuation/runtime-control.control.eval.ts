import { defineEval } from "eve/evals";
import { scriptedSession, expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: runtime-control finishes without an older approval.",
  timeoutMs: 60_000,
  async test(t) {
    const session = await t.session(scriptedSession);
    await expectReply(
      t,
      await session.start("Start the background draft and acknowledge its receipt."),
      /^Background receipt: .*"status":"working"/,
    );
    const live = await session.start("Cancel the background draft task and confirm cancellation.");
    const turn = await expectReply(t, live, /Cancellation result: .*"status":"cancelled"/);
    turn.calledTool("task_cancel", { status: "completed", count: 1 });
  },
});
