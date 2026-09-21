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
  description: "A tool error must reach the user while an older approval remains open.",
  timeoutMs: 60_000,
  async test(t) {
    const parked = await t.send("Prepare change A.", scriptedSession);
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;

    const live = await session.start("Try the unavailable draft store and explain the error.");
    await expectToolResult(t, live, "unavailable-draft");
    const turn = await expectReply(
      t,
      live,
      /Could not read the draft: .*The draft store is unavailable/,
    );
    turn.calledTool("unavailable-draft", { status: "failed", count: 1 });
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
  },
});
