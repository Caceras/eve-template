import { defineDynamic, type AgentReasoningDefinition } from "eve";
import { createGateway } from "ai";
import { mockModel, type MockModelRequest, type MockModelResponse } from "eve/evals";
import { PROVIDERS, pickModel } from "@/lib/model-catalog";
import { getCatalog } from "@/lib/provider-catalog";
import { openRouterModel } from "@/lib/openrouter-model";
import { readActiveProvider, readDefaultModel, readProviderKey } from "@/lib/provider-settings";

// Deterministic, keyless replies for the isolated browser checks (scripts/check-product.sh).
// Never set AEGENTICA_TEST_MODEL on a real deployment.
const testModel =
  process.env.AEGENTICA_TEST_MODEL === "mock" ? slowMockReplies(mockModel(mockReply)) : null;
if (testModel)
  console.warn("[aegentica] AEGENTICA_TEST_MODEL=mock: every reply is a scripted test reply.");

const SLOW_REPLY = "Slow mock reply: ";

function mockReply(request: MockModelRequest): MockModelResponse {
  const { lastUserMessage, tools, toolResults } = request;
  if (
    /weather/i.test(lastUserMessage ?? "") &&
    !toolResults.length &&
    tools.some((tool) => tool.name === "get_weather")
  )
    return { toolCalls: [{ name: "get_weather", input: { city: "Stockholm" } }] };
  // Human-in-the-loop checks: a tool that always needs approval (write_file in the
  // sandbox) and eve's ask_question, then a reply that names what came back. An
  // answered approval resumes in a new turn without a new message; the approved
  // call must have run (or been refused) by then, or the mock asks again. A
  // question's answer resumes after the per-turn clock note (agent/instructions/clock.ts).
  const resumed = isClockNote(lastUserMessage ?? "");
  const last = resumed ? lastAuthoredMessage(request) : (lastUserMessage ?? "");
  const answered = toolResultSinceLastUserMessage(request);
  if ((/approval demo/i.test(last) && answered) || (/ask me/i.test(last) && (answered || resumed)))
    return {
      text: `Mock reply: ${last}${answered ? `\n\nTool result: ${JSON.stringify(answered.output)}` : ""}`,
    };
  if (/approval demo/i.test(last) && tools.some((tool) => tool.name === "write_file"))
    return {
      toolCalls: [
        {
          name: "write_file",
          input: { content: "Written after approval.", filePath: "$HOME/approval-demo.txt" },
        },
      ],
    };
  if (/ask me/i.test(last) && tools.some((tool) => tool.name === "ask_question"))
    return {
      toolCalls: [
        {
          name: "ask_question",
          input: {
            question: "Which colour should the test use?",
            options: [
              { label: "Blue", description: "The calm option." },
              { label: "Green", description: "The fresh option." },
            ],
          },
        },
      ],
    };
  // A reply that streams in several pieces over a few seconds (slowMockReplies).
  if (/slow reply/i.test(last))
    return { text: `${SLOW_REPLY}${last}\n\nOne. Two. Three. Four. Five. Six. Seven. Eight.` };
  return {
    text: `Mock reply: ${last}\n\n- First point\n- Second point\n\n\`\`\`ts\nconst ready = true;\n\`\`\``,
  };
}

const isClockNote = (text: string) => text.startsWith("[Context] Current time:");

function lastAuthoredMessage({ userMessages }: MockModelRequest) {
  return userMessages.findLast((text) => !isClockNote(text)) ?? "";
}

/** The tool result that answered the latest user message, if the model has one. */
function toolResultSinceLastUserMessage(request: MockModelRequest) {
  const asked = lastAuthoredMessage(request);
  const lastUser = request.messages.findLastIndex(
    (message) => message.role === "user" && message.text === asked,
  );
  return request.messages.slice(lastUser + 1).some((message) => message.role === "tool")
    ? request.toolResults.at(-1)
    : undefined;
}

/**
 * eve's mock model streams a reply as one text delta. A slow reply instead
 * arrives in eight pieces 700 ms apart, so browser checks can reload, steer or
 * stop mid-reply and see a reply made of several streamed fragments.
 */
function slowMockReplies(model: ReturnType<typeof mockModel>) {
  const streaming = model as unknown as {
    doStream: (options: unknown) => Promise<{ stream: ReadableStream<{ type: string }> }>;
  };
  const doStream = streaming.doStream;
  streaming.doStream = async (options) => {
    const result = await doStream(options);
    const pieces = new TransformStream<{ type: string; delta?: string }>({
      async transform(chunk, controller) {
        if (chunk.type !== "text-delta" || !chunk.delta?.startsWith(SLOW_REPLY))
          return controller.enqueue(chunk);
        const size = Math.ceil(chunk.delta.length / 8);
        for (let start = 0; start < chunk.delta.length; start += size) {
          controller.enqueue({ ...chunk, delta: chunk.delta.slice(start, start + size) });
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      },
    });
    return { ...result, stream: result.stream.pipeThrough(pieces) };
  };
  return model;
}

const DEFAULT_WINDOW = 128_000;
const WORKING_WINDOW = 200_000;

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
        let model = pickModel(provider, models, requested);
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
        // A picture anywhere in the conversation needs a model that reads images.
        // A selection error would end the chat for good, so switch this step to
        // the provider's default (or first) vision model instead.
        if (hasImages && !model.vision) {
          const vision = [pickModel(provider, models, undefined), ...models].find(
            (candidate) => candidate?.vision,
          );
          if (!vision)
            throw new Error(
              `No ${PROVIDERS[provider].label} model can read images right now. Remove the picture or switch provider in Settings.`,
            );
          model = vision;
        }
        const profileReasoning = ctx.session.auth.current?.attributes.agentReasoning;
        const reasoning: AgentReasoningDefinition | undefined =
          !options.prefer &&
          (profileReasoning === "provider-default" ||
            profileReasoning === "low" ||
            profileReasoning === "medium" ||
            profileReasoning === "high")
            ? profileReasoning
            : undefined;
        // Compaction triggers at a share of the window; on million-token models
        // that would let a long-lived chat (Telegram keeps one for a month) send
        // ~800k tokens every step. Work within a smaller window instead.
        const contextWindow = Math.min(model.contextWindow ?? DEFAULT_WINDOW, WORKING_WINDOW);
        const selection =
          provider === "gateway"
            ? {
                model: createGateway({ apiKey })(model.id),
                modelContextWindowTokens: contextWindow,
              }
            : {
                model: openRouterModel(apiKey, model, {
                  reasoning: reasoning ?? "high",
                }),
                modelContextWindowTokens: contextWindow,
              };
        return reasoning ? { ...selection, reasoning } : selection;
      },
    },
  });
}
