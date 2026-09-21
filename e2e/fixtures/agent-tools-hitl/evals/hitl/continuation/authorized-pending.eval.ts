import { defineEval } from "eve/evals";
import {
  scriptedSession,
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  expectToolResult,
  requestFrom,
} from "./helpers.ts";

export default defineEval({
  description:
    "An approval requiring an authenticated responder cannot silence an unrelated tool reply.",
  timeoutMs: 60_000,
  async test(t) {
    const parked = await t.send("Prepare an authorized change.", scriptedSession);
    const approval = requestFrom(parked, "authorized-change");
    const session = parked.session;

    const live = await session.start("Read the draft status.");
    await expectToolResult(t, live, "read-draft");
    await expectReply(t, live, "Draft status: ready.");
    expectChangeStillUnexecuted(session, "authorized-change");
    await approveSavedChange(session, approval);
  },
});
