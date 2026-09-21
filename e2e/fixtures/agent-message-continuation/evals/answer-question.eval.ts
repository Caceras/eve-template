import { defineEval } from "eve/evals";
import {
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  expectToolResult,
  ownerOf,
  requestFrom,
} from "./helpers.ts";

export default defineEval({
  description:
    "answer-question: resolving the current request must finish its work while change A still waits.",
  async test(t) {
    const first = await t.send("Prepare change A.");
    const approvalA = requestFrom(first, "change-a");
    const session = first.session;
    const second = await session.send("Ask which color to use, then read the draft status.");
    const current = requestFrom(second, "ask_question");

    const live = await session.startRespond([{ requestId: current.requestId, optionId: "red" }]);
    await expectToolResult(t, live, "read-draft");
    const reply = await expectReply(t, live, "Draft status: ready.", ownerOf(second));
    reply.calledTool("read-draft", { status: "completed", count: 1 });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approvalA);
  },
});
