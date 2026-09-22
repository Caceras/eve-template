export const MODEL_HEADER = "x-aegentica-model";

export const PROVIDERS = {
  gateway: {
    label: "Vercel AI Gateway",
    shortLabel: "AI Gateway",
    defaultModel: "openai/gpt-5.6-luna-fast",
    keyPlaceholder: "Paste your AI Gateway API key",
    keysUrl: "https://vercel.com/dashboard/ai/api-keys",
    billingUrl: "https://vercel.com/dashboard/ai",
    recommended: [
      "openai/gpt-5.6-luna-fast",
      "anthropic/claude-sonnet-5",
      "google/gemini-3.8-flash",
      "openai/gpt-6-sol",
      "anthropic/claude-opus-5.5",
    ],
  },
  openrouter: {
    label: "OpenRouter",
    shortLabel: "OpenRouter",
    defaultModel: "openai/gpt-5.6-luna",
    keyPlaceholder: "sk-or-v1-…",
    keysUrl: "https://openrouter.ai/settings/keys",
    billingUrl: "https://openrouter.ai/settings/credits",
    recommended: [
      "openai/gpt-5.6-luna",
      "anthropic/claude-sonnet-5",
      "google/gemini-3.8-flash",
      "openai/gpt-6-sol",
      "anthropic/claude-opus-5.5",
    ],
  },
} as const;

export type ProviderId = keyof typeof PROVIDERS;
export const PROVIDER_IDS = Object.keys(PROVIDERS) as ProviderId[];
export function isProviderId(value: unknown): value is ProviderId {
  return typeof value === "string" && Object.hasOwn(PROVIDERS, value);
}

/** A model this tool-using agent can run: text in, text out, tool calls. */
export type CatalogModel = {
  id: string;
  name: string;
  /** Model maker, e.g. "anthropic", taken from the id prefix. */
  maker: string;
  contextWindow: number | null;
  /** USD per million tokens. */
  inputPrice: number | null;
  outputPrice: number | null;
  reasoning: boolean;
  vision: boolean;
};

const MODEL_ID = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.:-]+$/;
export function isModelId(value: unknown): value is string {
  return typeof value === "string" && value.length <= 200 && MODEL_ID.test(value);
}

function perMillion(value: unknown): number | null {
  const price = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(price) && price >= 0 ? Math.round(price * 1e8) / 100 : null;
}
function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];

/** Normalizes one entry of `GET https://ai-gateway.vercel.sh/v1/models`; null when the agent cannot use it. */
export function normalizeGatewayModel(entry: Record<string, unknown>): CatalogModel | null {
  const modalities = (entry.modalities ?? {}) as Record<string, unknown>;
  const tags = strings(entry.tags);
  const input = strings(modalities.input);
  const pricing = (entry.pricing ?? {}) as Record<string, unknown>;
  if (
    !isModelId(entry.id) ||
    entry.type !== "language" ||
    !input.includes("text") ||
    !strings(modalities.output).includes("text") ||
    !tags.includes("tool-use")
  )
    return null;
  return {
    id: entry.id,
    name: typeof entry.name === "string" ? entry.name : entry.id,
    maker: entry.id.split("/")[0]!,
    contextWindow: positiveInteger(entry.context_window),
    inputPrice: perMillion(pricing.input),
    outputPrice: perMillion(pricing.output),
    reasoning: tags.includes("reasoning"),
    vision: input.includes("image"),
  };
}

/** Normalizes one entry of `GET https://openrouter.ai/api/v1/models`; null when the agent cannot use it. */
export function normalizeOpenRouterModel(entry: Record<string, unknown>): CatalogModel | null {
  const architecture = (entry.architecture ?? {}) as Record<string, unknown>;
  const parameters = strings(entry.supported_parameters);
  const input = strings(architecture.input_modalities);
  const pricing = (entry.pricing ?? {}) as Record<string, unknown>;
  if (
    !isModelId(entry.id) ||
    // Batch variants answer asynchronously and cannot drive a live chat.
    entry.id.endsWith(":batch") ||
    !input.includes("text") ||
    !strings(architecture.output_modalities).includes("text") ||
    !parameters.includes("tools")
  )
    return null;
  return {
    id: entry.id,
    name: typeof entry.name === "string" ? entry.name.replace(/^[^:]+:\s*/, "") : entry.id,
    maker: entry.id.split("/")[0]!,
    contextWindow: positiveInteger(entry.context_length),
    inputPrice: perMillion(pricing.prompt),
    outputPrice: perMillion(pricing.completion),
    reasoning: parameters.includes("reasoning"),
    vision: input.includes("image"),
  };
}

export function normalizeCatalog(provider: ProviderId, entries: unknown[]): CatalogModel[] {
  const normalize = provider === "gateway" ? normalizeGatewayModel : normalizeOpenRouterModel;
  return entries
    .map((entry) =>
      entry && typeof entry === "object" ? normalize(entry as Record<string, unknown>) : null,
    )
    .filter((model): model is CatalogModel => model !== null);
}

/**
 * The model a turn actually runs: the requested one when the active provider
 * offers it, else that provider's default, else its first listed model.
 */
export function pickModel(
  provider: ProviderId,
  models: readonly CatalogModel[],
  requested: unknown,
): CatalogModel | undefined {
  const find = (id: unknown) => models.find((model) => model.id === id);
  return find(requested) ?? find(PROVIDERS[provider].defaultModel) ?? models[0];
}
