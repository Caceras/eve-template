import { e2eAgentConfig } from "@eve-e2e/config";
import { defineAgent } from "eve";
import { continuationModel } from "./lib/model.ts";

export default defineAgent({
  ...e2eAgentConfig(),
  model: continuationModel(),
  modelContextWindowTokens: 1_000_000,
  limits: { maxOutputTokensPerSession: 100 },
});
