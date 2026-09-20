import type { JsonValue } from "#shared/json.js";
import {
  AGENT_ROUTER_TOOL_DESCRIPTION,
  createAgentRouterInputSchema,
  executeAgentRouterTool,
  type AgentRouterDurableOptions,
  type AgentRouterInput,
  type AgentRouterOptions,
  type AgentRouterSelect,
} from "#execution/tools/agent-router.js";
import {
  defineWorkflowTool,
  type BlockingWorkflowToolDefinition,
} from "#tools/workflow-definition.js";

export type { AgentRouterInput, AgentRouterOptions, AgentRouterSelect };

export type AgentRouterTool = BlockingWorkflowToolDefinition<AgentRouterInput, JsonValue>;

/** Defines a workflow tool that uses JEV to route a task across all available agent targets. */
export function agentRouter(): AgentRouterTool;
export function agentRouter(options: AgentRouterOptions): AgentRouterTool;
export function agentRouter(options: AgentRouterOptions = {}): AgentRouterTool {
  const normalized = normalizeAgentRouterOptions(options);
  return defineWorkflowTool({
    availableInSubagents: false,
    description: AGENT_ROUTER_TOOL_DESCRIPTION,
    execute: executeAgentRouterTool,
    inputSchema: createAgentRouterInputSchema(normalized),
  }) as AgentRouterTool;
}

function normalizeAgentRouterOptions(options: AgentRouterOptions): AgentRouterDurableOptions {
  if (typeof options !== "object" || options === null || Array.isArray(options)) {
    throw new TypeError("agentRouter options must be an object.");
  }
  if (options.select !== undefined) {
    if (typeof options.select !== "function") {
      throw new TypeError("agentRouter select must be an authored step function.");
    }
    if (options.model !== undefined || options.instructions !== undefined) {
      throw new TypeError(
        "agentRouter select cannot be combined with model or instructions; configure them inside the selector.",
      );
    }
    const stepId = Reflect.get(options.select, "stepId");
    if (typeof stepId !== "string" || stepId.length === 0) {
      throw new TypeError(
        'agentRouter select must be a top-level authored function whose first statement is "use step".',
      );
    }
    return { selectStepId: stepId };
  }
  if (options.model !== undefined && (typeof options.model !== "string" || !options.model.trim())) {
    throw new TypeError("agentRouter model must be a non-empty model ID.");
  }
  if (
    options.instructions !== undefined &&
    (typeof options.instructions !== "string" || !options.instructions.trim())
  ) {
    throw new TypeError("agentRouter instructions must be non-empty when provided.");
  }
  const normalized: { instructions?: string; model?: string } = {};
  if (options.instructions !== undefined) normalized.instructions = options.instructions;
  if (options.model !== undefined) normalized.model = options.model;
  return normalized;
}
