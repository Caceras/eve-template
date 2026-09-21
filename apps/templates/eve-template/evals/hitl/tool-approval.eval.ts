import { defineEval } from "eve/evals";

export default defineEval({
  description: "An always-approved tool parks durably and resumes only after explicit approval.",
  async test(t) {
    const parked = await t.send(
      "Call confirm_demo exactly once with message 'approved-demo'. Do not use another tool.",
    );
    parked.session.requireInputRequest({ toolName: "confirm_demo" });
    parked.calledTool("confirm_demo", { count: 1, status: "pending" });

    const approved = await parked.session.respondAll("approve");
    approved.expectOk();
    approved.calledTool("confirm_demo", { count: 1, status: "completed" });
    approved.messageIncludes("approved-demo");
    t.succeeded();
  },
});
