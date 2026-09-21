import { defineEval } from "eve/evals";
import {
  scriptedSession,
  expectChangeStillUnexecuted,
  expectResponseReply,
  requestFrom,
} from "./helpers.ts";

export default defineEval({
  description:
    "Control: a workflow finishing beside an approval cannot bypass that turn's approval.",
  timeoutMs: 60_000,
  async test(t) {
    const parked = await t.send(
      "Prepare change A and read the workflow draft together.",
      scriptedSession,
    );
    const approval = requestFrom(parked, "change-a");
    parked.notEvent("message.completed");
    const session = parked.session;
    expectChangeStillUnexecuted(session);
    const live = await session.startRespond([
      { requestId: approval.requestId, optionId: "approve" },
    ]);
    await expectResponseReply(
      t,
      live,
      "Workflow draft status: ready. Change A resolved.",
      approval.requestId,
    );
    session.calledTool("change-a", { status: "completed", output: { executions: 1 }, count: 1 });
    session.calledTool("workflow-draft", { status: "completed", count: 1 });
  },
});
