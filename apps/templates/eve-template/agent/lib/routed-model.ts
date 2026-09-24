import { defineDynamic, type AgentReasoningDefinition } from "eve";
import { createGateway } from "ai";
import { mockModel, type MockModelRequest, type MockModelResponse } from "eve/evals";
import { PROVIDERS, pickModel } from "@/lib/model-catalog";
import { getCatalog } from "@/lib/provider-catalog";
import { openRouterModel } from "@/lib/openrouter-model";
import { readActiveProvider, readDefaultModel, readProviderKey } from "@/lib/provider-settings";

// Deterministic, keyless replies for the isolated browser checks (scripts/check-product.sh).
// Never set AEGENTICA_TEST_MODEL on a real deployment.
const testModel = process.env.AEGENTICA_TEST_MODEL === "mock" ? mockModel(mockReply) : null;
if (testModel)
  console.warn("[aegentica] AEGENTICA_TEST_MODEL=mock: every reply is a scripted test reply.");

function mockReply({ lastUserMessage, tools, toolResults }: MockModelRequest): MockModelResponse {
  if (
    /weather/i.test(lastUserMessage ?? "") &&
    !toolResults.length &&
    tools.some((tool) => tool.name === "get_weather")
  )
    return { toolCalls: [{ name: "get_weather", input: { city: "Stockholm" } }] };
  return {
    text: `Mock reply: ${lastUserMessage ?? ""}\n\n- First point\n- Second point\n\n\`\`\`ts\nconst ready = true;\n\`\`\``,
  };
}

/** Resolve the current provider, key and chosen model at every model step. */
export function routedModel(options: { prefer?: string } = {}) {
  return defineDynamic({
    events: {
      "step.started": async (_event, ctx) => {
        if (testModel) return { model: testModel, modelContextWindowTokens: 128_000 };
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
        const reasoning: AgentReasoningDefinition | undefined =
          !options.prefer &&
          (profileReasoning === "provider-default" ||
            profileReasoning === "low" ||
            profileReasoning === "medium" ||
            profileReasoning === "high")
            ? profileReasoning
            : undefined;
        const contextWindow = model.contextWindow ?? undefined;
        const selection =
          provider === "gateway"
            ? {
                model: createGateway({ apiKey })(model.id),
                modelContextWindowTokens: contextWindow,
              }
            : {
                model: openRouterModel(apiKey, model),
                modelContextWindowTokens: contextWindow ?? 128_000,
              };
        return reasoning ? { ...selection, reasoning } : selection;
      },
    },
  });
}
