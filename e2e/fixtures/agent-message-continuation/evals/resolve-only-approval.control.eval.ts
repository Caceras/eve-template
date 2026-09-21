import { defineEval } from "eve/evals";
import { expectReply, ownerOf, requestFrom } from "./helpers.ts";

export default defineEval({
  description: "Control: resolving the only approval runs its tool, reads the status, and replies.",
  async test(t) {
    const parked = await t.send("Prepare change B, then read the draft status.");
    const approval = requestFrom(parked, "change-b");
    const live = await parked.session.startRespond([
      { requestId: approval.requestId, optionId: "approve" },
    ]);
    const reply = await expectReply(t, live, "Draft status: ready.", ownerOf(parked));
    reply.calledTool("change-b", { status: "completed", count: 1 });
    reply.calledTool("read-draft", { status: "completed", count: 1 });
  },
});
