import { defineEval } from "eve/evals";
import { scriptedSession, expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: parallel-tools finishes without an older approval.",
  timeoutMs: 60_000,
  async test(t) {
    const session = await t.session(scriptedSession);
    const live = await session.start("Read and save the draft in parallel.");
    const turn = await expectReply(t, live, 'Draft status: ready. Draft saved: {"writes":1}.');
    turn.calledTool("read-draft", { status: "completed", count: 1 });
    turn.calledTool("save-draft", { status: "completed", count: 1 });
  },
});
