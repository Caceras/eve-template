import { defineEval } from "eve/evals";

export default defineEval({
  description: "The model-facing agent slot is Eve's agentRouter and can delegate specialist work.",
  async test(t) {
    const turn = await t.send(
      "Use the agent tool to delegate a source-quality research task: explain why primary sources should be preferred. Then summarize the delegated result.",
    );
    turn.expectOk();
    turn.calledTool("agent", { count: 1 });
    t.succeeded();
  },
});
