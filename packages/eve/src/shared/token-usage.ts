import { z } from "#compiled/zod/index.js";

/** Provider-reported token usage and optional model token cost totals. */
export type TokenUsage = z.infer<typeof tokenUsageWithCostSchema>;

/** Token-only schema retained for historical wire formats. */
export const tokenUsageSchema = z.object({
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
});

/** Current schema for provider-reported token usage and model token cost. */
export const tokenUsageWithCostSchema = tokenUsageSchema.extend({
  costUsd: z.number().finite().nonnegative().optional(),
});

/** Adds two reported usage deltas without turning an unreported cost into zero. */
export function addTokenUsage(
  a: TokenUsage | undefined,
  b: TokenUsage | undefined,
): TokenUsage | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return {
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
    costUsd:
      a.costUsd === undefined && b.costUsd === undefined
        ? undefined
        : (a.costUsd ?? 0) + (b.costUsd ?? 0),
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
  };
}
