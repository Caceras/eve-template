import { defineEval } from "eve/evals";
import { scriptedSession, expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: workflow-result finishes without an older approval.",
  timeoutMs: 60_000,
  async test(t) {
    const session = await t.session(scriptedSession);
    const live = await session.start("Read the draft through a workflow.");
    const turn = await expectReply(t, live, "Workflow draft status: ready.");
    turn.calledTool("workflow-draft", { status: "completed", count: 1 });
  },
});
