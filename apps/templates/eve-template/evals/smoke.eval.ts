import { defineEval } from "eve/evals";

export default defineEval({
  description:
    "The reference agent handles a simple conversational turn without requiring a specialist.",
  async test(t) {
    const turn = await t.send("Reply with exactly EVE-TEMPLATE-OK and do not call tools.");
    turn.expectOk();
    turn.messageIncludes("EVE-TEMPLATE-OK");
    t.succeeded();
  },
});
