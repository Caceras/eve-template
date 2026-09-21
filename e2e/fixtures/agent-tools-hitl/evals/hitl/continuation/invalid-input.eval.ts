import { defineEval } from "eve/evals";
import {
  scriptedSession,
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  requestFrom,
} from "./helpers.ts";

export default defineEval({
  description:
    "The model must be able to correct invalid tool input while an older approval waits.",
  timeoutMs: 60_000,
  async test(t) {
    const parked = await t.send("Prepare change A.", scriptedSession);
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;

    const live = await session.start(
      "Try a numeric draft ID, then correct it and read the status.",
    );
    const rejectedStep = await live.waitForEvent("step.completed", { data: { stepIndex: 0 } });
    t.log(
      `Initial tool-call step completed; awaiting correction: ${JSON.stringify(rejectedStep.data)}`,
    );
    const turn = await expectReply(t, live, /Draft status: ready\. Validation error: .*draftId/);
    turn.calledTool("read-draft", {
      status: "completed",
      input: { draftId: "draft-3494" },
      count: 1,
    });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
  },
});
