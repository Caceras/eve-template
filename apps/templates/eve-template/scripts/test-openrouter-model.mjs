// Proves the OpenRouter model eve receives sends only OpenRouter-compatible
// tools and reports cost where eve's session cost limit reads it.
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^\.\.?\//.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const { generateText, gateway, tool, jsonSchema } = await import("ai");
const { openRouterModel } = await import("../lib/openrouter-model.ts");

const requests = [];
const fetch = async (url, init) => {
  requests.push({ url: String(url), body: JSON.parse(init.body) });
  return Response.json({
    id: "gen-1",
    object: "chat.completion",
    created: 0,
    model: "anthropic/claude-sonnet-5",
    choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "OK" } }],
    usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6, cost: 0.0042 },
  });
};
const model = openRouterModel(
  "sk-or-v1-test",
  {
    id: "anthropic/claude-sonnet-5",
    name: "Claude Sonnet 5",
    maker: "anthropic",
    contextWindow: 1_000_000,
    inputPrice: 2,
    outputPrice: 10,
    reasoning: true,
    vision: true,
  },
  fetch,
);
const result = await generateText({
  model,
  prompt: "Reply with OK.",
  tools: {
    web_search: gateway.tools.exaSearch({}),
    session_counter: tool({ description: "Counts.", inputSchema: jsonSchema({ type: "object" }) }),
  },
});

assert.equal(requests.length, 1);
const [{ url, body }] = requests;
assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
assert.deepEqual(
  body.tools.map((t) => t.type),
  ["openrouter:web_search", "function"],
  "the Gateway search tool must be replaced by OpenRouter's",
);
assert.equal(body.tools[0].max_results, 10);
assert(!JSON.stringify(body).includes("gateway"), "no Gateway tool reaches OpenRouter");
assert.deepEqual(body.reasoning, { effort: "high" });
assert.deepEqual(body.usage, { include: true });
assert.equal(result.text, "OK");
assert.equal(result.providerMetadata?.gateway?.cost, 0.0042, "cost mirrored for eve's limit");
console.log(
  "PASS: OpenRouter requests carry openrouter:web_search instead of Gateway search, reasoning and usage settings, and cost for the session limit",
);
