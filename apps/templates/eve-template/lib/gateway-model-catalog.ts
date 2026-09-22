import {
  CATALOG_SNAPSHOT,
  DEFAULT_MODEL,
  modelUnavailableReason,
  type GatewayModel,
} from "./model-catalog";
type Catalog = {
  models: GatewayModel[];
  source: "live" | "snapshot" | "cached";
  updatedAt: string;
};
let cached: Catalog | undefined;
let expiresAt = 0;
let pending: Promise<Catalog> | undefined;
async function fetchCatalog(): Promise<Catalog> {
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/models", {
      signal: AbortSignal.timeout(8000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok || !response.body) throw new Error("Catalog unavailable");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4_000_000) {
        await reader.cancel();
        throw new Error("Catalog too large");
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(body.data) || body.data.length === 0 || body.data.length > 2000)
      throw new Error("Invalid catalog");
    const models: GatewayModel[] = body.data.map((entry: Record<string, unknown>) => {
      if (
        typeof entry.id !== "string" ||
        typeof entry.name !== "string" ||
        typeof entry.type !== "string"
      )
        throw new Error("Invalid model");
      const modalities = entry.modalities as { input?: string[]; output?: string[] } | undefined;
      return {
        id: entry.id,
        name: entry.name,
        provider: typeof entry.owned_by === "string" ? entry.owned_by : entry.id.split("/")[0],
        type: entry.type,
        input: modalities?.input ?? [],
        output: modalities?.output ?? [],
        tools: Array.isArray(entry.tags) && entry.tags.includes("tool-use"),
      };
    });
    cached = { models, source: "live", updatedAt: new Date().toISOString() };
    expiresAt = Date.now() + 300_000;
  } catch {
    if (cached) cached = { ...cached, source: "cached" };
    cached ??= { models: CATALOG_SNAPSHOT, source: "snapshot", updatedAt: "2026-09-22" };
    expiresAt = Date.now() + 30_000;
  }
  return cached;
}
export async function getGatewayCatalog(): Promise<Catalog> {
  if (cached && Date.now() < expiresAt) return cached;
  pending ??= fetchCatalog().finally(() => {
    pending = undefined;
  });
  return pending;
}
export async function resolveGatewayChatModel(value: unknown): Promise<string> {
  const id = typeof value === "string" && value ? value : DEFAULT_MODEL;
  const catalog = await getGatewayCatalog();
  const model = catalog.models.find((entry) => entry.id === id);
  if (!model)
    throw new Error(
      "The selected model is no longer in the Gateway catalog. Choose another model.",
    );
  const reason = modelUnavailableReason(model);
  if (reason) throw new Error(reason);
  return model.id;
}
