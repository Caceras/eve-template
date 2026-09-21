import { defineEval } from "eve/evals";
import { expectChangeStillUnexecuted, expectReply, ownerOf, requestFrom } from "./helpers.ts";

export default defineEval({
  description:
    "Control: a workflow finishing beside an approval cannot bypass that turn's approval.",
  async test(t) {
    const parked = await t.send("Prepare change A and read the workflow draft together.");
    const approval = requestFrom(parked, "change-a");
    parked.notEvent("turn.completed");
    const session = parked.session;
    expectChangeStillUnexecuted(session);
    const live = await session.startRespond([
      { requestId: approval.requestId, optionId: "approve" },
    ]);
    await expectReply(t, live, "Workflow draft status: ready. Change A resolved.", ownerOf(parked));
    session.calledTool("change-a", { status: "completed", count: 1 });
    session.calledTool("workflow-draft", { status: "completed", count: 1 });
  },
});
