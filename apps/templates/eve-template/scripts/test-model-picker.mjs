import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith("../") && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const { CATALOG_SNAPSHOT, DEFAULT_MODEL, MODEL_HEADER, resolveChatModel } =
  await import("../lib/model-catalog.ts");
const CHAT_MODELS = CATALOG_SNAPSHOT.filter((m) => m.type === "language" && m.tools);
const { readModelPreference, setModelPreference, modelRequestHeaders, subscribeModelPreference } =
  await import("../lib/chat/model-preference.ts");
assert.equal(resolveChatModel("invalid model"), DEFAULT_MODEL);
assert.equal(resolveChatModel({ id: CHAT_MODELS[1].id }), DEFAULT_MODEL);
assert.equal(readModelPreference(), DEFAULT_MODEL);
const storage = new Map();
const events = new EventTarget();
globalThis.window = Object.assign(events, {
  localStorage: { getItem: (k) => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v) },
});
let changes = 0;
const unsubscribe = subscribeModelPreference(() => changes++);
for (const model of CHAT_MODELS) {
  setModelPreference(model.id);
  assert.equal(readModelPreference(), model.id);
  assert.equal(modelRequestHeaders()[MODEL_HEADER], model.id);
}
assert.equal(changes, CHAT_MODELS.length);
storage.set("aegentica-chat-model", "bad value");
assert.equal(readModelPreference(), DEFAULT_MODEL);
window.localStorage.getItem = () => {
  throw new Error("blocked");
};
window.localStorage.setItem = () => {
  throw new Error("blocked");
};
setModelPreference(CHAT_MODELS[1].id);
assert.equal(readModelPreference(), CHAT_MODELS[1].id);
unsubscribe();
delete globalThis.window;
console.log(
  "PASS: model ID validation, invalid-model fallback, persisted selection, request headers, cross-component updates and blocked-storage fallback",
);
