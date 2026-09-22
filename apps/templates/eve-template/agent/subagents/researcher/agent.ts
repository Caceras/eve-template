import { defineAgent } from "eve";
import { routedModel } from "../../lib/routed-model";

export default defineAgent({
  description:
    "Research specialist for evidence gathering, source comparison, and synthesis. Use when the task benefits from a separate research context.",
  model: routedModel(),
  reasoning: "high",
});
