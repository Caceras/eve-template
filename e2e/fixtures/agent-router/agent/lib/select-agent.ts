import { auto } from "eve/tools/agent-router/auto";

const evaluationModel = {
  specificationVersion: "v4" as const,
  provider: "fixture",
  modelId: "agent-router-selector",
  supportedQuestionTypes: ["choice" as const],
  async doEvaluate() {
    return {
      answers: { route: { type: "choice" as const, choice: "agent" } },
      usage: { inputTokens: 1, outputTokens: 1 },
      warnings: [],
    };
  },
};

export async function selectAgent(
  message: string,
  agents: Readonly<Record<string, string>>,
  abortSignal: AbortSignal,
) {
  "use step";

  return auto({ abortSignal, agents, message, model: evaluationModel });
}
