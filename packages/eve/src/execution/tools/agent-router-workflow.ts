import type { JsonValue } from "#shared/json.js";
import { auto, normalizeAgents } from "#execution/tools/agent-router-auto.js";
import type { WorkflowToolContext } from "#tools/workflow-definition.js";
import type {
  AgentRouterAutoOptions,
  AgentRouterExecuteInput,
  AgentRouterSelect,
} from "#execution/tools/agent-router.js";

/** Routes one task through the complete workflow agent metadata snapshot. */
export async function executeAgentRouterTool(
  input: AgentRouterExecuteInput,
  ctx: WorkflowToolContext,
): Promise<JsonValue> {
  "use workflow";

  const agents = normalizeAgents(descriptions(ctx));
  const names = Object.keys(agents);
  if (names.length === 0) {
    throw new Error("agentRouter requires at least one available agent with a description.");
  }
  const target =
    names.length === 1
      ? names[0]!
      : input.routerOptions?.selectStepId === undefined
        ? await chooseTarget({
            abortSignal: ctx.abortSignal,
            agents,
            instructions: input.routerOptions?.instructions,
            message: input.message,
            model: input.routerOptions?.model,
          })
        : await selectStep(input.routerOptions.selectStepId)(
            input.message,
            agents,
            ctx.abortSignal,
          );
  if (!Object.hasOwn(agents, target)) {
    throw new Error(`agentRouter selected unavailable agent "${target}".`);
  }
  return ctx.agent(
    target,
    input.outputSchema === undefined
      ? { message: input.message }
      : { message: input.message, outputSchema: input.outputSchema },
  );
}

async function chooseTarget(options: AgentRouterAutoOptions): Promise<string> {
  "use step";

  return auto(options);
}

function selectStep(stepId: string): AgentRouterSelect {
  const useStep = Reflect.get(globalThis, Symbol.for("WORKFLOW_USE_STEP"));
  if (typeof useStep !== "function") {
    throw new Error("agentRouter cannot resolve its authored selector step.");
  }
  return useStep(stepId) as AgentRouterSelect;
}

function descriptions(ctx: WorkflowToolContext): Record<string, string> {
  return Object.fromEntries(
    Object.entries(ctx.agents).map(([name, metadata]) => [name, metadata.description]),
  );
}
