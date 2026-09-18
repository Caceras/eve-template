import { defineEval } from "eve/evals";

export default defineEval({
  description: "A blocking workflow starts only after approval.",
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

    const resolved = await parked.session.respondAll("approve");
    resolved.expectOk();
    resolved.event("action.partial", {
      data: { result: { toolName: "guarded_workflow", output: "WORKFLOW-GUARDED-EXECUTING" } },
    });
    resolved.messageIncludes("WORKFLOW-GUARDED-COMPLETE");
    t.noFailedActions();
  },
});
