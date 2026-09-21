import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Independent reviewer for checking plans, claims, code, and outputs for errors, omissions, contradictions, and risky assumptions.",
  model: "anthropic/claude-sonnet-5",
  reasoning: "high",
  tool: false,
});
