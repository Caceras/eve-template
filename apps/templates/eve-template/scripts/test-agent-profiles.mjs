import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^(\.\.?\/|file:)/.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const directory = await mkdtemp(join(tmpdir(), "aegentica-profiles-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
const store = await import("../lib/agent-profiles.ts");
const { handleAgentProfiles } = await import("../lib/agent-profiles-handler.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");
const { operatorAuth } = await import("../lib/operator.ts");
const { default: listTool } = await import("../agent/tools/list_saved_agents.ts");
const { default: createTool } = await import("../agent/tools/create_saved_agent.ts");
const cookie = `eve_chat_session=${createPasswordSessionToken()}`;
const call = (body, options = {}) =>
  handleAgentProfiles(
    new Request("https://app.test/api/agents", {
      method: body ? "POST" : "GET",
      headers: {
        host: "app.test",
        origin: options.origin ?? "https://app.test",
        "content-type": "application/json",
        ...(options.anonymous ? {} : { cookie }),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
const input = {
  name: "Research partner",
  instructions: "Use primary sources and distinguish assumptions.",
  knowledge: "My test reference context.",
  model: "anthropic/claude-sonnet-5",
  reasoning: "high",
};
try {
  assert.deepEqual(await store.listProfiles(), []);
  assert.equal((await call(undefined, { anonymous: true })).status, 401);
  assert.equal(
    (await call({ action: "save", profile: input }, { origin: "https://other.test" })).status,
    403,
  );
  assert.equal(
    (await call({ action: "save", profile: { ...input, permissions: ["admin"] } })).status,
    400,
  );
  const create = await call({ action: "save", profile: input });
  assert.equal(create.status, 200);
  const { profile } = await create.json();
  assert.equal(profile.version, 1);
  assert.equal(profile.reasoning, "high");
  const encrypted = await readFile(join(directory, "agents.enc.json"), "utf8");
  assert(!encrypted.includes(input.instructions), "instructions encrypted at rest");
  assert(!encrypted.includes(input.knowledge), "reference context encrypted at rest");
  const attrs = await store.profileAttributes(
    new Request("https://app.test/eve/v1/sessions", {
      headers: { "x-aegentica-profile": profile.id, "x-aegentica-mode": "research" },
    }),
  );
  assert.equal(attrs.agentProfileId, profile.id);
  assert.equal(attrs.chatModel, profile.model);
  assert.equal(attrs.composerMode, "research");
  assert.match(attrs.agentProfileInstructions, /does not grant permissions/);
  assert.equal(
    (
      await store.profileAttributes(
        new Request("https://app.test", { headers: { "x-aegentica-mode": "admin" } }),
      )
    ).composerMode,
    undefined,
  );
  const update = await call({
    action: "save",
    id: profile.id,
    version: 1,
    profile: { ...input, name: "Updated partner" },
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).profile.version, 2);
  assert.equal(
    (await call({ action: "save", id: profile.id, version: 1, profile: input })).status,
    409,
  );
  assert.equal((await call({ action: "delete", id: profile.id, version: 1 })).status, 409);
  assert.equal(
    (await call({ action: "save", profile: { ...input, instructions: "x".repeat(4001) } })).status,
    400,
  );
  assert.equal(
    (await call({ action: "save", profile: { ...input, model: "invalid model" } })).status,
    400,
  );
  assert.equal(
    (await call({ action: "save", profile: { ...input, knowledge: "x".repeat(70000) } })).status,
    413,
  );
  const operator = { session: { auth: { current: operatorAuth("password") } } };
  const listed = await listTool.execute({}, operator);
  assert(JSON.stringify(listed).includes("Updated partner"));
  assert(!JSON.stringify(listed).includes(input.knowledge));
  await assert.rejects(listTool.execute({}, { session: { auth: { current: null } } }), /Operator/);
  await assert.rejects(
    createTool.execute(input, { session: { auth: { current: null } } }),
    /Operator/,
  );
  const createdByTool = await createTool.execute(
    { ...input, name: "Tool-created partner" },
    operator,
  );
  assert(createdByTool.id);
  assert(createTool.approval, "creator declares approval policy");
  assert.equal((await call({ action: "delete", id: profile.id, version: 2 })).status, 200);
  const missing = await store.profileAttributes(
    new Request("https://app.test", { headers: { "x-aegentica-profile": profile.id } }),
  );
  assert.match(missing.agentProfileError, /no longer exists/);
  await assert.rejects(store.saveProfile(input, profile.id, 2), (error) => error.status === 404);
  await Promise.all([
    store.saveProfile({ ...input, name: "Parallel one" }),
    store.saveProfile({ ...input, name: "Parallel two" }),
  ]);
  assert.equal(
    (await store.listProfiles()).length,
    3,
    "concurrent writes are serialized without lost profiles",
  );
  console.log(
    "PASS: encrypted agent CRUD, bounded strict validation, optimistic conflicts, serialized writes, auth/CSRF, immutable profile attributes, unknown/deleted profile handling, operator-only tools and creator approval",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
