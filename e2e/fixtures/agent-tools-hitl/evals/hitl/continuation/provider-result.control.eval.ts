import { defineEval } from "eve/evals";
import { scriptedSession, expectReply } from "./helpers.ts";

export default defineEval({
  description: "Control: provider-result finishes without an older approval.",
  timeoutMs: 60_000,
  async test(t) {
    const session = await t.session(scriptedSession);
    const live = await session.start("Look up the draft with the provider and report its status.");
    await expectReply(t, live, "Provider draft status: provider-ready.");
  },
});
