import { z } from "#compiled/zod/index.js";
import type { JsonObject } from "#shared/json.js";
import type { evaluate } from "#ai/evaluate.js";

export { executeAgentRouterTool } from "#execution/tools/agent-router-workflow.js";

export const AGENT_ROUTER_TOOL_DESCRIPTION =
  "Route a task to the best available subagent based on each subagent's declared description.";

export type AgentRouterSelect = (
  message: string,
  agents: Readonly<Record<string, string>>,
  abortSignal: AbortSignal,
) => Promise<string>;

export type AgentRouterOptions =
  | {
      /** Instructions used to select an agent. */
      readonly instructions?: string;
      /** Evaluation model ID. Defaults to TypeSafe Jev. */
      readonly model?: string;
      readonly select?: never;
    }
  | {
      readonly instructions?: never;
      readonly model?: never;
      /** Authored durable step that selects one name from the candidate map. */
      readonly select: AgentRouterSelect;
    };

export interface AgentRouterAutoOptions {
  readonly abortSignal?: AbortSignal;
  readonly agents: Readonly<Record<string, string>>;
  /** Instructions used to select an agent. */
  readonly instructions?: string;
  readonly message: string;
  /** Evaluation model instance or ID. Defaults to TypeSafe Jev. */
  readonly model?: Parameters<typeof evaluate>[0]["model"];
}

export interface AgentRouterInput {
  readonly message: string;
  readonly outputSchema?: JsonObject;
}

export interface AgentRouterDurableOptions {
  readonly instructions?: string;
  readonly model?: string;
  readonly selectStepId?: string;
}

export interface AgentRouterExecuteInput extends AgentRouterInput {
  readonly routerOptions?: AgentRouterDurableOptions;
}

export const AGENT_ROUTER_INPUT_SCHEMA: z.ZodType<AgentRouterInput> = z.strictObject({
  message: z.string().min(1).describe("The complete task to send to the selected agent."),
  outputSchema: (
    z
      .looseObject({})
      .describe(
        "Only provide a non-empty JSON Schema when the caller explicitly requests structured output; otherwise omit this field. The selected agent must match a provided schema, and that structured output becomes the tool result.",
      ) as z.ZodType<JsonObject>
  ).optional(),
});

export function createAgentRouterInputSchema(
  options: AgentRouterDurableOptions,
): z.ZodType<AgentRouterExecuteInput> {
  return AGENT_ROUTER_INPUT_SCHEMA.transform((input) => ({
    ...input,
    routerOptions: options,
  }));
}
