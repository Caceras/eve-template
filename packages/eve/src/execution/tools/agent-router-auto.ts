import { evaluate } from "eve/ai";
import type { AgentRouterAutoOptions } from "#execution/tools/agent-router.js";

export async function auto({
  abortSignal,
  agents,
  instructions = "Which subagent should handle this task?",
  message,
  model = "typesafe-ai/jev",
}: AgentRouterAutoOptions): Promise<string> {
  if (typeof message !== "string" || message.trim().length === 0) {
    throw new Error("agentRouter auto requires a non-empty message.");
  }
  if (typeof agents !== "object" || agents === null || Array.isArray(agents)) {
    throw new Error("agentRouter auto requires an agent description map.");
  }
  if (typeof instructions !== "string" || instructions.trim().length === 0) {
    throw new Error("agentRouter auto requires non-empty instructions when provided.");
  }
  if (
    (typeof model === "string" && model.trim().length === 0) ||
    (typeof model !== "string" && (typeof model !== "object" || model === null))
  ) {
    throw new Error("agentRouter auto requires a valid evaluation model when provided.");
  }
  const criteria = normalizeAgents(agents);
  const names = Object.keys(criteria);
  if (names.length === 0) {
    throw new Error("agentRouter requires at least one available agent with a description.");
  }
  if (names.length === 1) return names[0]!;

  const result = await evaluate({
    abortSignal,
    model,
    state: { message },
    questions: {
      route: {
        type: "choice",
        instructions,
        criteria,
      },
    },
  });
  return result.answers.route.choice;
}

export function normalizeAgents(agents: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(agents).flatMap(([name, description]) => {
      if (typeof description !== "string") {
        throw new Error(`agentRouter auto requires a string description for agent "${name}".`);
      }
      const trimmed = description.trim();
      return trimmed.length === 0 ? [] : [[name, trimmed]];
    }),
  );
}
