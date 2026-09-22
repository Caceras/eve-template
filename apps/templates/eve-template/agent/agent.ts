import { defineAgent } from "eve";
import { routedModel } from "./lib/routed-model";

export default defineAgent({
  description:
    "General-purpose Ægentica agent. Keep simple work in the root; delegate deep research and review when their narrower contexts are useful.",
  model: routedModel(),
  reasoning: "high",
  compaction: {
    thresholdPercent: 0.8,
  },
  limits: {
    maxInputTokensPerSession: 2_000_000,
    maxOutputTokensPerSession: 200_000,
    maxTokenCostUsdPerSession: 25,
    sessionTimeoutMs: 30 * 24 * 60 * 60 * 1_000,
  },
});
