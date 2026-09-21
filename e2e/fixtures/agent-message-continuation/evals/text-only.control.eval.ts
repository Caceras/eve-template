import { defineEval } from "eve/evals";
import {
  approveSavedChange,
  expectChangeStillUnexecuted,
  expectReply,
  requestFrom,
} from "./helpers.ts";

export default defineEval({
  description:
    "Control: a text-only follow-up completes while the original approval stays answerable.",
  async test(t) {
    const parked = await t.send("Prepare change A.");
    const approval = requestFrom(parked, "change-a");
    const session = parked.session;
    const live = await session.start("Explain what is waiting, without calling any tools.");
    await expectReply(t, live, "Your changes are waiting for approval.");
    expectChangeStillUnexecuted(session);
    await approveSavedChange(session, approval);
  },
});
