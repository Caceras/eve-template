import { defineAgent } from "eve";
import { routedModel } from "../../lib/routed-model";

export default defineAgent({
  description:
    "Independent reviewer for checking plans, claims, code, and outputs for errors, omissions, contradictions, and risky assumptions.",
  // A different model family than the default gives a more independent review.
  model: routedModel({ prefer: "anthropic/claude-sonnet-5" }),
  reasoning: "high",
  tool: false,
});
