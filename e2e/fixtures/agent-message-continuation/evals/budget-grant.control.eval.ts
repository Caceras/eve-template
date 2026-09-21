import { defineEval } from "eve/evals";
import { equals } from "eve/evals/expect";
import { expectToolResult, requestFrom } from "./helpers.ts";

export default defineEval({
  description: "Control: a renewed budget runs one tool, then asks for the next grant.",
  async test(t) {
    const first = await t.send("Use the remaining budget to say hello.");
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
    next.notEvent("turn.completed");
    await session.respond([{ requestId: nextBudget.requestId, optionId: "stop" }]);
  },
});
