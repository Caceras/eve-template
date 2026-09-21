import { defineEval } from "eve/evals";
import { expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: tool-error finishes without an older approval.",
  async test(t) {
    const session = await t.session();
    const live = await session.start("Try the unavailable draft store and explain the error.");
    const turn = await expectReply(
      t,
      live,
      /Could not read the draft: .*The draft store is unavailable/,
    );
    turn.calledTool("unavailable-draft", { status: "failed", count: 1 });
  },
});
