import { defineEval } from "eve/evals";
import {
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  requestFrom,
  expectToolResult,
} from "./helpers.ts";

export default defineEval({
  description: "A task-control result must be interpreted while an older approval waits.",
  async test(t) {
    const parked = await t.send("Prepare change A.");
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;

    const live = await session.start("Cancel the missing draft task and explain the result.");
    await expectToolResult(t, live, "task_cancel");
    const turn = await expectReply(t, live, /^Cancellation result: /);
    turn.calledTool("task_cancel", { count: 1 });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
  },
});
