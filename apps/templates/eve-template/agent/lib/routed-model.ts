import { defineDynamic } from "eve";
import {
  createGateway,
  wrapLanguageModel,
  type LanguageModelMiddleware,
  type ProviderMetadata,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { PROVIDERS, pickModel } from "@/lib/model-catalog";
import { getCatalog } from "@/lib/provider-catalog";
import { readActiveProvider, readProviderKey } from "@/lib/provider-settings";

/**
 * eve's session cost limit reads spend from AI Gateway metadata only; mirror
 * OpenRouter's reported cost there so `maxTokenCostUsdPerSession` still applies.
 */
function withGatewayCost(metadata: ProviderMetadata | undefined) {
  const usage = metadata?.openrouter?.usage;
  const cost = usage && typeof usage === "object" && "cost" in usage ? usage.cost : undefined;
  return typeof cost === "number" ? { ...metadata, gateway: { cost } } : metadata;
}
const reportOpenRouterCost: LanguageModelMiddleware = {
  wrapGenerate: async ({ doGenerate }) => {
    const result = await doGenerate();
    return { ...result, providerMetadata: withGatewayCost(result.providerMetadata) };
  },
  wrapStream: async ({ doStream }) => {
    const result = await doStream();
    return {
      ...result,
      stream: result.stream.pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            controller.enqueue(
              chunk.type === "finish"
                ? { ...chunk, providerMetadata: withGatewayCost(chunk.providerMetadata) }
                : chunk,
            );
          },
        }),
      ),
    };
  },
};

/**
 * Routes every model step through the provider and key currently saved in
 * Settings, so switching provider, key or model applies to the next step
 * without restarting eve. `prefer` pins a model when the active provider
 * offers it; otherwise the caller's composer choice, then the provider default.
 */
export function routedModel(options: { prefer?: string } = {}) {
  return defineDynamic({
    events: {
      "step.started": async (_event, ctx) => {
        const provider = await readActiveProvider();
        const { apiKey } = await readProviderKey(provider);
        if (!apiKey)
          throw new Error(
            `No ${PROVIDERS[provider].label} API key is configured. Add one in Settings.`,
          );
        const { models } = await getCatalog(provider);
        const requested = options.prefer ?? ctx.session.auth.current?.attributes.chatModel;
        const model = pickModel(provider, models, requested);
        if (!model) throw new Error(`${PROVIDERS[provider].label} returned no compatible models.`);
        const contextWindow = model.contextWindow ?? undefined;
        if (provider === "gateway")
          return {
            model: createGateway({ apiKey })(model.id),
            modelContextWindowTokens: contextWindow,
          };
        const openrouter = createOpenRouter({
          apiKey,
          appName: "Ægentica",
          appUrl: process.env.BETTER_AUTH_URL,
        });
        return {
          model: wrapLanguageModel({
            model: openrouter.chat(model.id, {
              usage: { include: true },
              // OpenRouter ignores the AI SDK call-level reasoning option; it is a model setting.
              ...(model.reasoning ? { reasoning: { effort: "high" } } : {}),
            }),
            middleware: reportOpenRouterCost,
          }),
          // OpenRouter models are not in eve's Gateway metadata catalog.
          modelContextWindowTokens: contextWindow ?? 128_000,
        };
      },
    },
  });
}
