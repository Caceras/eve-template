import { defineEval } from "eve/evals";

export default defineEval({
  description:
    "A blocking workflow tool can ask a human, resume, and delegate to a copy of the root agent.",
  async test(t) {
    const parked = await t.send(
      "Use confirm_then_research for the topic 'Eve workflow tools'. Do not answer directly.",
    );
    parked.session.requireInputRequest({
      toolName: "confirm_then_research",
      display: "confirmation",
    });

    const approved = await parked.session.respondAll("approve");
    approved.expectOk();
    approved.calledTool("confirm_then_research", { count: 1, status: "completed" });
    approved.calledSubagent("agent", { count: 1, status: "completed" });
    t.succeeded();
  },
});
