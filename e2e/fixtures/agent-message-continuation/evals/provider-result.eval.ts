import { defineEval } from "eve/evals";
import {
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  expectToolResult,
  requestFrom,
} from "./helpers.ts";

export default defineEval({
  description:
    "A provider-executed tool result must get a follow-up model call while an older approval waits.",
  async test(t) {
    const parked = await t.send("Prepare change A.");
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;

    const live = await session.start("Look up the draft with the provider and report its status.");
    await expectToolResult(t, live, "read-draft");
    await expectReply(t, live, "Provider draft status: provider-ready.");
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
  },
});
