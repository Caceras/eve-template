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
const { MODEL_HEADER, PROVIDERS, normalizeCatalog, pickModel } =
  await import("../lib/model-catalog.ts");
const snapshot = (await import("../lib/model-catalogs.snapshot.json", { with: { type: "json" } }))
  .default;

// Catalog normalization keeps only models this tool-using agent can run.
const gateway = normalizeCatalog("gateway", [
  {
    id: "maker/chat",
    name: "Chat",
    type: "language",
    context_window: 200000,
    modalities: { input: ["text", "image"], output: ["text"] },
    tags: ["tool-use", "reasoning"],
    pricing: { input: "0.000002", output: "0.00001" },
  },
  {
    id: "maker/no-tools",
    name: "x",
    type: "language",
    modalities: { input: ["text"], output: ["text"] },
    tags: [],
  },
  {
    id: "maker/image",
    name: "x",
    type: "image",
    modalities: { input: ["text"], output: ["image"] },
    tags: ["tool-use"],
  },
  {
    id: "bad id",
    name: "x",
    type: "language",
    modalities: { input: ["text"], output: ["text"] },
    tags: ["tool-use"],
  },
  null,
]);
assert.deepEqual(gateway, [
  {
    id: "maker/chat",
    name: "Chat",
    maker: "maker",
    contextWindow: 200000,
    inputPrice: 2,
    outputPrice: 10,
    reasoning: true,
    vision: true,
  },
]);
const openrouter = normalizeCatalog("openrouter", [
  {
    id: "maker/free:free",
    name: "Maker: Free Model",
    context_length: 32768,
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    supported_parameters: ["tools"],
    pricing: { prompt: "0", completion: "0" },
  },
  {
    id: "maker/slow:batch",
    name: "Batch",
    architecture: { input_modalities: ["text"], output_modalities: ["text"] },
    supported_parameters: ["tools"],
  },
]);
assert.equal(openrouter.length, 1);
assert.equal(openrouter[0].name, "Free Model");
assert.equal(openrouter[0].inputPrice, 0);
assert.equal(openrouter[0].reasoning, false);

// Every provider's default and recommendations exist in the bundled snapshot.
for (const [provider, info] of Object.entries(PROVIDERS)) {
  const ids = new Set(snapshot[provider].map((model) => model.id));
  assert(ids.has(info.defaultModel), `${provider} default ${info.defaultModel} missing`);
  for (const id of info.recommended) assert(ids.has(id), `${provider} recommends missing ${id}`);
  assert(
    snapshot[provider].every((model) => model.contextWindow === null || model.contextWindow > 0),
  );
}

// Switching providers keeps a shared model id and otherwise falls back to the provider default.
assert.equal(
  pickModel("openrouter", snapshot.openrouter, "anthropic/claude-sonnet-5").id,
  "anthropic/claude-sonnet-5",
);
assert.equal(
  pickModel("openrouter", snapshot.openrouter, "openai/gpt-5.6-luna-fast").id,
  PROVIDERS.openrouter.defaultModel,
);
assert.equal(pickModel("gateway", snapshot.gateway, undefined).id, PROVIDERS.gateway.defaultModel);
assert.equal(pickModel("gateway", [], "x/y"), undefined);

// Browser preference: validated, persisted, remembered as recent, sent as a header.
const {
  readModelPreference,
  readRecentModels,
  setModelPreference,
  modelRequestHeaders,
  subscribeModelPreference,
} = await import("../lib/chat/model-preference.ts");
assert.equal(readModelPreference(), "");
const storage = new Map();
globalThis.window = Object.assign(new EventTarget(), {
  localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
});
assert.deepEqual(modelRequestHeaders(), {});
let changes = 0;
const unsubscribe = subscribeModelPreference(() => changes++);
setModelPreference("not a model");
assert.equal(changes, 0);
for (const id of ["a/1", "b/2", "a/1", "c/3", "d/4", "e/5", "f/6"]) setModelPreference(id);
assert.equal(readModelPreference(), "f/6");
assert.deepEqual(modelRequestHeaders(), { [MODEL_HEADER]: "f/6" });
assert.deepEqual(readRecentModels(), ["f/6", "e/5", "d/4", "c/3", "a/1"]);
assert.equal(changes, 7);
storage.set("aegentica-chat-model", "bad value");
assert.equal(readModelPreference(), "f/6");
window.localStorage.getItem = () => {
  throw new Error("blocked");
};
window.localStorage.setItem = () => {
  throw new Error("blocked");
};
setModelPreference("g/7");
assert.equal(readModelPreference(), "g/7");
unsubscribe();
delete globalThis.window;

// Server catalog: one shared fetch per provider, snapshot fallback when offline.
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async (url) => {
  calls++;
  if (String(url).includes("openrouter")) throw new Error("offline");
  return Response.json({
    data: [
      {
        id: "new/model",
        name: "New",
        type: "language",
        modalities: { input: ["text"], output: ["text"] },
        tags: ["tool-use"],
      },
    ],
  });
};
try {
  const { getCatalog } = await import("../lib/provider-catalog.ts");
  const [a, b] = await Promise.all([getCatalog("gateway"), getCatalog("gateway")]);
  assert.equal(calls, 1);
  assert.equal(a, b);
  assert.equal(a.source, "live");
  assert.deepEqual(
    a.models.map((m) => m.id),
    ["new/model"],
  );
  const offline = await getCatalog("openrouter");
  assert.equal(offline.source, "snapshot");
  assert.equal(offline.models.length, snapshot.openrouter.length);
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  "PASS: catalog normalization for both providers, snapshot defaults, cross-provider model fallback, browser preference/recents/header, shared catalog fetch and offline fallback",
);
