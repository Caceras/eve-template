import { defineDynamic } from "eve";
import { createGateway } from "ai";
import { PROVIDERS, pickModel } from "@/lib/model-catalog";
import { getCatalog } from "@/lib/provider-catalog";
import { openRouterModel } from "@/lib/openrouter-model";
import { readActiveProvider, readDefaultModel, readProviderKey } from "@/lib/provider-settings";

/**
 * Routes every model step through the provider and key currently saved in
 * Settings, so switching provider, key or model applies to the next step
 * without restarting eve. `prefer` pins a model when the active provider
 * offers it; otherwise the caller's composer choice, then the operator's saved
 * default (for Telegram and schedules), then the provider default.
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
        const requested =
          options.prefer ??
          ctx.session.auth.current?.attributes.chatModel ??
          (await readDefaultModel());
        const model = pickModel(provider, models, requested);
        if (!model) throw new Error(`${PROVIDERS[provider].label} returned no compatible models.`);

        const hasImages = ctx.messages.some(
          (message) =>
            Array.isArray(message.content) &&
            message.content.some(
              (part) =>
                part.type === "image" ||
                (part.type === "file" && part.mediaType.startsWith("image/")),
            ),
        );
        if (hasImages && !model.vision)
          throw new Error(
            "The selected model cannot read images. Choose a model marked Vision and retry.",
          );
        const profileReasoning = ctx.session.auth.current?.attributes.agentReasoning;
        const reasoning =
          !options.prefer &&
          (profileReasoning === "provider-default" ||
            profileReasoning === "low" ||
            profileReasoning === "medium" ||
            profileReasoning === "high")
            ? profileReasoning
            : undefined;
        const contextWindow = model.contextWindow ?? undefined;
        if (provider === "gateway")
          return {
            model: createGateway({ apiKey })(model.id),
            modelContextWindowTokens: contextWindow,
            ...(reasoning ? { reasoning } : {}),
          };
        return {
          model: openRouterModel(apiKey, model),
          // OpenRouter models are not in eve's Gateway metadata catalog.
          modelContextWindowTokens: contextWindow ?? 128_000,
          ...(reasoning ? { reasoning } : {}),
        };
      },
    },
  });
}
