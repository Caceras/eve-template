import { defineEval } from "eve/evals";
import { expectChangeStillUnexecuted, requestFrom, scriptedSession } from "./helpers.ts";

export default defineEval({
  description:
    "authorized-older-sibling: resolving an older request must finish that request while a newer request remains open.",
  tags: ["hitl", "continuation", "regression", "input-response", "authorization"],
  timeoutMs: 60_000,
  async test(t) {
    // Given A awaits approval and a newer authorized change also awaits approval.
    const first = await t.send("Prepare change A.", scriptedSession);
    const approvalA = requestFrom(first, "change-a");
    const session = first.session;
    const second = await session.send("Prepare an authorized change, then read the draft status.");
    requestFrom(second, "authorized-change");

    // When the user resolves the older request first.
    const resolved = (
      await session.respond([{ requestId: approvalA.requestId, optionId: "approve" }])
    ).expectOk();

    // Then A executes once, and the newer request remains answerable.
    resolved.calledTool("change-a", {
      status: "completed",
      output: { executions: 1 },
      count: 1,
    });
    resolved.event("input.resolved", {
      data: { resolutions: [{ requestId: approvalA.requestId }] },
      count: 1,
    });
    expectChangeStillUnexecuted(session, "authorized-change");
  },
});
