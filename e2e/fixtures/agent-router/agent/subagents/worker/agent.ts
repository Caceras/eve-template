import { defineAgent } from "eve";
import { mockModel } from "eve/evals";

export default defineAgent({
  description: "Handle tasks that should not be routed to the root copy.",
  model: mockModel({ modelId: "agent-router-worker", respond: "AGENT-ROUTER-WORKER" }),
  modelContextWindowTokens: 1_000_000,
  tool: false,
});
