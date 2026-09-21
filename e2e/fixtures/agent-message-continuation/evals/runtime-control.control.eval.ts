import { defineEval } from "eve/evals";
import { expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: runtime-control finishes without an older approval.",
  async test(t) {
    const session = await t.session();
    const live = await session.start("Cancel the missing draft task and explain the result.");
    const turn = await expectReply(t, live, /^Cancellation result: /);
    turn.calledTool("task_cancel", { count: 1 });
  },
});
