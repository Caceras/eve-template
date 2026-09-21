import { defineEval } from "eve/evals";

export default defineEval({
  description: "defineState persists typed working state across turns in one durable session.",
  async test(t) {
    const first = await t.send(
      "Call session_counter exactly once with note 'first'. Report the count returned by the tool.",
    );
    first.expectOk();
    first.calledTool("session_counter", { count: 1, status: "completed" });

    const second = await first.session.send(
      "Call session_counter exactly once with note 'second'. Report the count returned by the tool.",
    );
    second.expectOk();
    second.calledTool("session_counter", { count: 1, status: "completed" });
    second.messageIncludes("2");
    t.succeeded();
  },
});
