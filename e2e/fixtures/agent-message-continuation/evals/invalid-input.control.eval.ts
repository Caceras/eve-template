import { defineEval } from "eve/evals";
import { expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: invalid-input finishes without an older approval.",
  async test(t) {
    const session = await t.session();
    const live = await session.start(
      "Try a numeric draft ID, then correct it and read the status.",
    );
    const turn = await expectReply(t, live, "Draft status: ready.");
    turn.calledTool("read-draft", { status: "failed", count: 1 });
    turn.calledTool("read-draft", {
      status: "completed",
      input: { draftId: "draft-3494" },
      count: 1,
    });
  },
});
