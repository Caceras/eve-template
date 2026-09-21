import { defineEval } from "eve/evals";
import { expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: workflow-result finishes without an older approval.",
  async test(t) {
    const session = await t.session();
    const live = await session.start("Read the draft through a workflow.");
    const turn = await expectReply(t, live, "Workflow draft status: ready.");
    turn.calledTool("workflow-draft", { status: "completed", count: 1 });
  },
});
