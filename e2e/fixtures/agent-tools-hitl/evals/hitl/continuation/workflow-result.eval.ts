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
  description: "A completed workflow result must be interpreted for the current user message.",
  timeoutMs: 60_000,
  async test(t) {
    const parked = await t.send("Prepare change A.", scriptedSession);
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;

    const live = await session.start("Read the draft through a workflow.");
    await expectToolResult(t, live, "workflow-draft");
    const turn = await expectReply(t, live, "Workflow draft status: ready.");
    turn.calledTool("workflow-draft", { status: "completed", count: 1 });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
  },
});
