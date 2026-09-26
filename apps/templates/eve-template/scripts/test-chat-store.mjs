import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try {
      return next(specifier, context);
    } catch (error) {
      if (!specifier.split("/").at(-1).includes(".")) return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const directory = await mkdtemp(join(tmpdir(), "aegentica-chats-"));
process.env.EVE_CHAT_DB_PATH = join(directory, "chats.sqlite");
const store = await import("../lib/db/sqlite-queries.ts");
const event = (type, data = {}) => ({ type, data, meta: { id: crypto.randomUUID() } });
try {
  // Create, pending message titles the chat, ownership is enforced.
  const chat = await store.createChat("riki", { pendingUserMessage: "Plan my week" });
  assert.equal(chat.title, "Plan my week");
  assert.equal(await store.getChatForUser(chat.id, "mallory"), null);
  await assert.rejects(
    store.appendChatEvent({ chatId: chat.id, event: event("x"), eventIndex: 0, userId: "mallory" }),
    /not found/,
  );

  // Events persist in order; a settled turn clears the pending message.
  let loaded = await store.getChatForUser(chat.id, "riki");
  assert.equal(loaded.pendingUserMessage, "Plan my week");
  await store.appendChatEvent({
    chatId: chat.id,
    event: event("message.received"),
    eventIndex: 0,
    userId: "riki",
  });
  await store.appendChatEvent({
    chatId: chat.id,
    event: event("session.waiting"),
    eventIndex: 1,
    userId: "riki",
  });
  await store.saveChatSessionState({
    chatId: chat.id,
    session: { sessionId: "s1", streamIndex: 2 },
    userId: "riki",
  });
  loaded = await store.getChatForUser(chat.id, "riki");
  assert.deepEqual(
    loaded.events.map((e) => e.type),
    ["message.received", "session.waiting"],
  );
  assert.deepEqual(loaded.session, { sessionId: "s1", streamIndex: 2 });

  // Snapshot replaces and truncates events and clears the pending message.
  await store.markChatPendingMessage({ chatId: chat.id, message: "Again", userId: "riki" });
  await store.saveChatSnapshot({
    chatId: chat.id,
    events: [event("only")],
    session: undefined,
    userId: "riki",
  });
  loaded = await store.getChatForUser(chat.id, "riki");
  assert.deepEqual(
    loaded.events.map((e) => e.type),
    ["only"],
  );
  assert.equal(loaded.pendingUserMessage, null);
  assert.equal(loaded.session, undefined);

  // skipChatAuthorization appends after the last event.
  const skipped = await store.skipChatAuthorization({
    chatId: chat.id,
    events: [event("a"), event("b")],
    session: undefined,
    userId: "riki",
  });
  assert.equal(skipped.eventIndex, 1);
  assert.equal((await store.getChatForUser(chat.id, "riki")).events.length, 3);

  // Paging: newest first, stable cursor, other users isolated.
  for (let i = 0; i < 25; i++) {
    await store.createChat("riki", { title: `Chat ${i}` });
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  await store.createChat("mallory", { title: "Not yours" });
  const first = await store.listChatsPageByUser("riki");
  assert.equal(first.items.length, 20);
  assert.equal(first.items[0].title, "Chat 24");
  const second = await store.listChatsPageByUser("riki", first.nextCursor);
  assert.equal(second.items.length, 6);
  assert.equal(second.nextCursor, null);
  const all = [...first.items, ...second.items];
  assert.equal(new Set(all.map((c) => c.id)).size, 26);
  assert(!all.some((c) => c.title === "Not yours"));
  // Search asks for one larger page instead of walking the pages one by one.
  const { chatPageSize } = await import("../lib/chat/paging.ts");
  const wide = await store.listChatsPageByUser("riki", null, chatPageSize("100"));
  assert.deepEqual(
    wide.items.map((c) => c.id),
    all.map((c) => c.id),
  );
  assert.equal(wide.nextCursor, null);
  const narrow = await store.listChatsPageByUser("riki", null, 5);
  assert.equal(narrow.items.length, 5);
  assert.deepEqual(
    (await store.listChatsPageByUser("riki", narrow.nextCursor, 5)).items[0].id,
    all[5].id,
  );
  assert.equal(chatPageSize("100000"), 100, "capped at 100");
  for (const invalid of [null, "", "0", "-5", "2.5", "ten", "1e3"])
    assert.equal(chatPageSize(invalid), 20, `${invalid} falls back to the default page`);

  // Rename: owner only, keeps its place in history, survives the next message.
  const { normalizeChatTitle } = await import("../lib/chat/rename.ts");
  assert.equal(normalizeChatTitle("  Weekend\n  in   Stockholm "), "Weekend in Stockholm");
  assert.equal(normalizeChatTitle(" \n "), null);
  assert.equal(normalizeChatTitle("x".repeat(500)).length, 120);
  const before = (await store.listChatsPageByUser("riki")).items.map((c) => c.id);
  assert.equal(await store.renameChatForUser(chat.id, "mallory", "Stolen"), false);
  assert.equal(await store.renameChatForUser(chat.id, "riki", "Stockholm trip"), true);
  assert.deepEqual(
    (await store.listChatsPageByUser("riki")).items.map((c) => c.id),
    before,
  );
  const renamed = await store.markChatPendingMessage({
    chatId: chat.id,
    message: "One more thing",
    userId: "riki",
  });
  assert.equal(renamed.title, "Stockholm trip");

  // Delete cascades to events.
  await store.deleteChatForUser(chat.id, "riki");
  assert.equal(await store.getChatForUser(chat.id, "riki"), null);
  console.log(
    "PASS: SQLite chat store — ownership, event order, pending/settled, snapshot truncation, auth skip, paging (20 by default, up to 100 on request) and isolation, owner-only rename, cascade delete",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
