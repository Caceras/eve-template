// A full disk must surface as "database or disk is full", not as SQLite's
// "cannot rollback - no transaction is active": SQLite rolls the transaction
// back by itself on SQLITE_FULL, and an unconditional ROLLBACK then threw a
// second, misleading error that hid the real one. Every connection here is
// capped at its size after setup (PRAGMA max_page_count), as a full disk would.
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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

const exec = DatabaseSync.prototype.exec;
DatabaseSync.prototype.exec = function (sql) {
  const result = exec.call(this, sql);
  if (/CREATE TABLE IF NOT EXISTS/.test(sql)) {
    const { page_count: pages } = this.prepare("PRAGMA page_count").get();
    exec.call(this, `PRAGMA max_page_count = ${pages}`);
  }
  return result;
};

const directory = await mkdtemp(join(tmpdir(), "aegentica-disk-full-"));
process.env.EVE_CHAT_DB_PATH = join(directory, "chats.sqlite");
process.env.EVE_MEMORY_DIR = join(directory, "memory");
await mkdir(process.env.EVE_MEMORY_DIR);
const chats = await import("../lib/db/sqlite-queries.ts");
const memory = await import("../lib/memory-store.ts");
const { durableMemory } = await import("../agent/lib/durable-memory.ts");

const full = /database or disk is full/;
const big = (n) => "x".repeat(n);
try {
  const chat = await chats.createChat("riki", { title: "Full disk" });
  const events = Array.from({ length: 8 }, (_, index) => ({
    type: "message.received",
    data: { text: big(4_000) },
    meta: { id: String(index) },
  }));
  await assert.rejects(
    chats.saveChatSnapshot({ chatId: chat.id, events, session: undefined, userId: "riki" }),
    full,
  );
  // The failed save left no open transaction behind: the next small write works.
  await chats.renameChatForUser(chat.id, "riki", "Still writable");
  assert.equal((await chats.getChatForUser(chat.id, "riki")).title, "Still writable");

  memory.recordOperatorMemoryKey("operator");
  assert.throws(() => memory.addMemories([big(1_900), big(1_901), big(1_902), big(1_903)]), full);
  assert.deepEqual(memory.readOperatorMemory().entries, []);

  const backend = durableMemory(join(directory, "agent"));
  const signal = new AbortController().signal;
  await assert.rejects(
    backend.write({ key: "k", content: big(20_000), expectedVersion: null, signal }),
    full,
  );
  assert.equal(await backend.read({ key: "k", signal }), null);
  console.log("PASS: a full disk reports itself in chat saves, the Memory page and eve's memory");
} finally {
  DatabaseSync.prototype.exec = exec;
  await rm(directory, { recursive: true, force: true });
}
