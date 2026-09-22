import snapshot from "./gateway-models.snapshot.json" with { type: "json" };
export const MODEL_HEADER = "x-aegentica-model";
export const DEFAULT_MODEL = "openai/gpt-5.6-luna-fast";
export type ChatModelId = string;
export type GatewayModel = {
  id: string;
  name: string;
  provider: string;
  type: string;
  input: string[];
  output: string[];
  tools: boolean;
};
export const CATALOG_SNAPSHOT: GatewayModel[] = snapshot;
export function resolveChatModel(value: unknown): string {
  return typeof value === "string" &&
    value.length <= 200 &&
    /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.:-]+$/.test(value)
    ? value
    : DEFAULT_MODEL;
}
export function modelUnavailableReason(model: GatewayModel): string | null {
  if (model.type !== "language" || !model.input.includes("text") || !model.output.includes("text"))
    return `${model.type} model · requires a different interface`;
  if (!model.tools) return "No tool support · not compatible with this agent";
  return null;
}
