import { defineEval } from "eve/evals";
import { expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: background-receipt finishes without an older approval.",
  async test(t) {
    const session = await t.session();
    const live = await session.start("Start the background draft and acknowledge its receipt.");
    const turn = await expectReply(t, live, /^Background receipt: .*"status":"working"/);
    turn.calledTool("background-draft", { count: 1 });
    await session.cancel();
  },
});
