import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith("./") && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const originalFetch = globalThis.fetch;
let calls = 0;
globalThis.fetch = async () => {
  calls++;
  return Response.json({
    data: [
      {
        id: "new-provider/new-model",
        name: "New model",
        owned_by: "new-provider",
        type: "language",
        modalities: { input: ["text"], output: ["text"] },
        tags: ["tool-use"],
      },
      {
        id: "new-provider/image-model",
        name: "Image model",
        owned_by: "new-provider",
        type: "image",
        modalities: { input: ["text"], output: ["image"] },
        tags: [],
      },
    ],
  });
};
try {
  const { getGatewayCatalog, resolveGatewayChatModel } =
    await import("../lib/gateway-model-catalog.ts");
  const catalogs = await Promise.all([getGatewayCatalog(), getGatewayCatalog()]);
  assert.equal(calls, 1);
  assert.equal(catalogs[0].models.length, 2);
  assert.equal(await resolveGatewayChatModel("new-provider/new-model"), "new-provider/new-model");
  await assert.rejects(resolveGatewayChatModel("new-provider/image-model"), /different interface/);
  await assert.rejects(resolveGatewayChatModel("invented/model"), /no longer/);
  assert.equal(calls, 1);
  console.log(
    "PASS: full live catalog, newly added providers accepted, shared fetch/cache, incompatible and nonexistent models rejected",
  );
} finally {
  globalThis.fetch = originalFetch;
}
