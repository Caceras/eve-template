import { defineEval } from "eve/evals";
import {
  scriptedSession,
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  requestFrom,
  expectToolResult,
} from "./helpers.ts";

export default defineEval({
  description: "An older approval cannot silence the reply after parallel reads and writes.",
  timeoutMs: 60_000,
  async test(t) {
    const parked = await t.send("Prepare change A.", scriptedSession);
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;

    const live = await session.start("Read and save the draft in parallel.");
    await expectToolResult(t, live, "save-draft");
    const turn = await expectReply(t, live, 'Draft status: ready. Draft saved: {"writes":1}.');
    turn.calledTool("read-draft", { status: "completed", count: 1 });
    turn.calledTool("save-draft", { status: "completed", count: 1 });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
  },
});
