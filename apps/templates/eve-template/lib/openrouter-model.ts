import { wrapLanguageModel, type LanguageModelMiddleware, type ProviderMetadata } from "ai";
import { createOpenRouter, type OpenRouterChatSettings } from "@openrouter/ai-sdk-provider";
import type { CatalogModel } from "./model-catalog";

/**
 * eve's session cost limit reads spend from AI Gateway metadata only; mirror
 * OpenRouter's reported cost there so `maxTokenCostUsdPerSession` still applies.
 */
function withGatewayCost(metadata: ProviderMetadata | undefined) {
  const usage = metadata?.openrouter?.usage;
  const cost = usage && typeof usage === "object" && "cost" in usage ? usage.cost : undefined;
  return typeof cost === "number" ? { ...metadata, gateway: { cost } } : metadata;
}
const openRouterCompatibility: LanguageModelMiddleware = {
  // eve attaches AI Gateway's provider-executed search (`gateway.exa_search`)
  // to dynamically selected models; OpenRouter rejects it, so use its own.
  transformParams: async ({ params }) => ({
    ...params,
    tools: params.tools?.map((tool) =>
      tool.type === "provider" && tool.id.startsWith("gateway.")
        ? {
            type: "provider",
            id: "openrouter.web_search",
            name: tool.name,
            args: { maxResults: 10 },
          }
        : tool,
    ),
  }),
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

/** An OpenRouter chat model that behaves like an AI Gateway model inside eve. */
export function openRouterModel(
  apiKey: string,
  model: CatalogModel,
  fetch?: typeof globalThis.fetch,
) {
  const settings: OpenRouterChatSettings = { usage: { include: true } };
  // OpenRouter ignores the AI SDK call-level reasoning option; it is a model setting.
  if (model.reasoning) settings.reasoning = { effort: "high" };
  return wrapLanguageModel({
    model: createOpenRouter({
      apiKey,
      appName: "Ægentica",
      appUrl: process.env.BETTER_AUTH_URL,
      fetch,
    }).chat(model.id, settings),
    middleware: openRouterCompatibility,
  });
}
