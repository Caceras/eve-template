import { defineEval } from "eve/evals";

export default defineEval({
  description: "A blocking workflow never starts when approval is denied.",
  async test(t) {
    const parked = await t.send("WORKFLOW-GUARDED-START");
    parked.expectOk();
    parked.session.requireInputRequest({
      display: "confirmation",
      toolName: "guarded_workflow",
    });
    parked.notEvent("action.partial", {
      data: { result: { toolName: "guarded_workflow" } },
    });
    parked.notEvent("action.result", {
      data: { result: { toolName: "guarded_workflow" } },
    });

    const resolved = await parked.session.respondAll("cancel");
    resolved.expectOk();
    resolved.notEvent("action.partial", {
      data: { result: { toolName: "guarded_workflow" } },
    });
    resolved.event("action.result", {
      count: 1,
      data: { result: { toolName: "guarded_workflow" }, status: "rejected" },
    });
    t.succeeded();
  },
});
