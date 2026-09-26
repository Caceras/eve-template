// Proves the Memory page and eve's fileMemory() provider share one document
// format: each side's writes are readable, recallable and editable by the other.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
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
const directory = await mkdtemp(join(tmpdir(), "aegentica-memory-"));
process.env.EVE_MEMORY_DIR = directory;
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");

const { fileMemory } = await import("eve/memory/file");
const { durableMemory } = await import("../agent/lib/durable-memory.ts");
const store = await import("../lib/memory-store.ts");
const { handleMemorySettings, splitImport } = await import("../lib/memory-settings-handler.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");

const key = "scope-key-operator";
const provider = fileMemory({
  maxCharacters: store.MEMORY_MAX_CHARACTERS,
  backend: durableMemory(directory),
});
const context = {
  abortSignal: new AbortController().signal,
  memory: { scope: { key, namespace: "test", value: "operator" }, slot: "profile" },
  messages: [],
  operationId: "op",
};
const recall = async () =>
  (await provider.recall["turn.started"](context))?.messages[0]?.content ?? "";
const tools = await provider.tools({
  ...context,
  memory: { scope: { key, namespace: "test", value: "operator" }, slot: "profile" },
});
const tool = (name) => Object.entries(tools).find(([id]) => id.endsWith(name))[1];

try {
  // Before the agent has seen the operator, the page reports "not ready".
  assert.equal(store.readOperatorMemory().ready, false);
  assert.throws(() => store.addMemories(["x"]), /first/);

  // The agent saves through eve's own tool; the page reads the same entry.
  store.recordOperatorMemoryKey(key);
  await tool("save_memory").execute({ text: "Lives in   Stockholm" }, {});
  assert.deepEqual(store.readOperatorMemory().entries, [{ index: 0, text: "Lives in Stockholm" }]);

  // The page adds, edits and removes; eve recalls and edits the result.
  store.addMemories(["Prefers short answers", "Lives in Stockholm", "Works on Ægentica"]);
  let entries = store.readOperatorMemory().entries;
  assert.deepEqual(
    entries.map((e) => e.index),
    [0, 1, 2],
    "duplicates skipped, indexes continue",
  );
  store.updateMemory(1, "Prefers short, direct answers");
  store.removeMemory(2);
  const recalled = await recall();
  assert.match(recalled, /0: Lives in Stockholm\n1: Prefers short, direct answers$/);
  await tool("remove_memory").execute({ index: 0 }, {});
  assert.deepEqual(store.readOperatorMemory().entries, [
    { index: 1, text: "Prefers short, direct answers" },
  ]);
  await tool("save_memory").execute({ text: "Has a Pixel 10" }, {});
  assert.equal(
    store.readOperatorMemory().entries.at(-1).index,
    3,
    "eve continues after the page's last index",
  );

  // Removing the last memory leaves a document eve still reads: the header alone.
  for (const entry of store.readOperatorMemory().entries) store.removeMemory(entry.index);
  assert.equal(store.readOperatorMemory().entries.length, 0);
  assert.match(await recall(), /No memories are saved/, "an emptied memory still recalls");
  await tool("save_memory").execute({ text: "Has a Pixel 10" }, {});
  assert.equal(store.readOperatorMemory().entries.at(-1).index, 4);
  // A document an older release emptied (with a trailing blank line) loads again.
  const { DatabaseSync } = await import("node:sqlite");
  const raw = new DatabaseSync(join(directory, "profile.sqlite"));
  raw
    .prepare("UPDATE memory SET content = ? WHERE key = ?")
    .run("<!-- eve-memory-file-v1 lastAllocatedIndex=4 -->\n\n", key);
  raw.close();
  assert.match(await recall(), /No memories are saved/, "a legacy emptied document is healed");
  await tool("save_memory").execute({ text: "Has a Pixel 10" }, {});
  assert.equal(store.readOperatorMemory().entries.at(-1).index, 5);

  // Limits match the provider: long entries and a full memory are refused.
  assert.throws(() => store.addMemories(["x".repeat(2100)]), store.MemoryLimitError);
  assert.throws(
    () => store.addMemories(Array.from({ length: 10 }, (_, i) => `${i} ${"y".repeat(1000)}`)),
    /full/,
  );

  // Import splits pasted lists and bullets.
  assert.deepEqual(splitImport("- One\n2. Two\n\n• Three\n  Four  "), [
    "One",
    "Two",
    "Three",
    "Four",
  ]);

  // The settings API is operator-only and same-origin.
  const cookie = `eve_chat_session=${createPasswordSessionToken()}`;
  const call = (body, options = {}) =>
    handleMemorySettings(
      new Request("https://app.test/api/settings/memory", {
        method: body ? "POST" : "GET",
        headers: {
          host: "app.test",
          origin: options.origin ?? "https://app.test",
          ...(options.anonymous ? {} : { cookie }),
          "content-type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      }),
    );
  assert.equal((await call(undefined, { anonymous: true })).status, 401);
  assert.equal(
    (await call({ action: "remove", index: 1 }, { origin: "https://evil.test" })).status,
    403,
  );
  const listed = await (await call({ action: "import", text: "Likes sauna\nLikes sauna" })).json();
  assert(listed.entries.some((e) => e.text === "Likes sauna"));
  assert.equal(listed.usage.limit, 8000);
  assert.deepEqual(listed.imported, { added: 1, skipped: 1 }, "a repeated line is counted");
  // An import says what it saved and what it skipped as already saved.
  const again = await (
    await call({ action: "import", text: "- Likes sauna\n- Drinks tea" })
  ).json();
  assert.deepEqual(again.imported, { added: 1, skipped: 1 });
  // More lines than one import takes are refused whole, never cut off unseen.
  const tooMany = Array.from({ length: 61 }, (_, i) => `Note ${i}`).join("\n");
  const refused = await call({ action: "import", text: tooMany });
  assert.equal(refused.status, 400);
  assert.match((await refused.json()).error, /up to 60 lines.*this has 61/);
  assert(!store.readOperatorMemory().entries.some((e) => e.text === "Note 0"), "nothing saved");
  // A paste past the memory limit gets that answer, not a request-size error.
  const huge = await call({
    action: "import",
    text: Array.from({ length: 20 }, (_, i) => `${i} ${"z".repeat(1000)}`).join("\n"),
  });
  assert.equal(huge.status, 422);
  assert.match((await huge.json()).error, /full/);
  assert.equal((await call({ action: "remove", index: -1 })).status, 400);
  assert.match(await recall(), /Likes sauna/);
  console.log(
    "PASS: Memory page and eve fileMemory share one document (save/recall/edit both ways, index continuity, limits), import parsing and counts, operator-only API",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
