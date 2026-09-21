import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { expectChangeStillUnexecuted, expectToolResult, requestFrom } from "./helpers.ts";

export default defineEval({
  description: "After a budget grant, an older approval cannot swallow the next budget request.",
  async test(t) {
    const first = await t.send("Prepare change A using the remaining budget.");
    requestFrom(first, "change-a");
    const session = first.session;
    const limited = await session.send("Read the draft status using the remaining budget.");
    const budget = requestFrom(limited, "session_limit_continuation");

    const live = await session.startRespond([
      { requestId: budget.requestId, optionId: "continue" },
    ]);
    await expectToolResult(t, live, "read-draft");
    const next = (await live.result()).expectOk();
    const nextBudget = requestFrom(next, "session_limit_continuation");
    await t.check(nextBudget.requestId === budget.requestId, equals(false));
    next.calledTool("read-draft", { status: "completed", count: 1 });
    next.notEvent("message.completed");
    expectChangeStillUnexecuted(session);
    await session.respond([{ requestId: nextBudget.requestId, optionId: "stop" }]);
  },
});
