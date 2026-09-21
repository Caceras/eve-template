import { defineAgent } from "eve";

export default defineAgent({
  description:
    "Research specialist for evidence gathering, source comparison, and synthesis. Use when the task benefits from a separate research context.",
  model: "openai/gpt-5.6-luna-fast",
  reasoning: "high",
});
