import { defineEval } from "eve/evals";
import { expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: write finishes without an older approval.",
  async test(t) {
    const session = await t.session();
    const live = await session.start("Save the draft and report how many times it was written.");
    const turn = await expectReply(t, live, 'Draft saved: {"writes":1}.');
    turn.calledTool("save-draft", { status: "completed", count: 1 });
  },
});
