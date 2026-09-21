import { defineEval } from "eve/evals";
import { scriptedSession, expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: read finishes without an older approval.",
  timeoutMs: 60_000,
  async test(t) {
    const session = await t.session(scriptedSession);
    const live = await session.start("Read the draft status.");
    const turn = await expectReply(t, live, "Draft status: ready.");
    turn.calledTool("read-draft", { status: "completed", count: 1 });
  },
});
