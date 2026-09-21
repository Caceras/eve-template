import { defineEval } from "eve/evals";
import {
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  requestFrom,
  expectToolResult,
} from "./helpers.ts";

export default defineEval({
  description: "An older approval cannot silence the answer after a read.",
  async test(t) {
    const parked = await t.send("Prepare change A.");
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;

    const live = await session.start("Read the draft status.");
    await expectToolResult(t, live, "read-draft");
    const turn = await expectReply(t, live, "Draft status: ready.");
    turn.calledTool("read-draft", { status: "completed", count: 1 });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
  },
});
