import { defineEval } from "eve/evals";
import { scriptedSession, expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: invalid-input finishes without an older approval.",
  timeoutMs: 60_000,
  async test(t) {
    const session = await t.session(scriptedSession);
    const live = await session.start(
      "Try a numeric draft ID, then correct it and read the status.",
    );
    const turn = await expectReply(t, live, /Draft status: ready\. Validation error: .*draftId/);
    turn.calledTool("read-draft", {
      status: "completed",
      input: { draftId: "draft-3494" },
      count: 1,
    });
  },
});
