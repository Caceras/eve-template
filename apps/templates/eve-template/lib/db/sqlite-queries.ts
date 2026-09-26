import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { isChatTurnSettledEvent } from "@/lib/chat/events";
import { CHAT_PAGE_SIZE, chatPageSize } from "@/lib/chat/paging";
import type { ActiveChat, ChatListItem, ChatListPage } from "@/lib/chat/types";
import { createFallbackTitle, DEFAULT_CHAT_TITLE } from "@/lib/chat/title";

/**
 * Chat history for the self-hosted single-operator deployment: a SQLite file on
 * the persistent volume, shared by the Next.js process (web chat) and the eve
 * process (scheduled tasks). Mirrors `pg-queries.ts` so either backend serves
 * the same server actions and API routes.
 */

export function chatDatabasePath() {
  if (process.env.EVE_CHAT_DB_PATH?.trim()) return process.env.EVE_CHAT_DB_PATH.trim();
  const base = process.env.EVE_MEMORY_DIR?.trim()
    ? dirname(process.env.EVE_MEMORY_DIR.trim())
    : ".eve/.workflow-data";
  return join(base, "chats.sqlite");
}

let database: DatabaseSync | undefined;
function db() {
  if (database) return database;
  const path = chatDatabasePath();
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  // The busy timeout applies from the first statement: switching to WAL and
  // creating tables wait for the other process instead of failing at once.
  const connection = new DatabaseSync(path, { timeout: 5000 });
  try {
    connection.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS chat (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL,
        eve_session TEXT,
        pending_user_message TEXT,
        pending_created_at INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_chat_user_updated ON chat (user_id, updated_at DESC, id DESC);
      CREATE TABLE IF NOT EXISTS chat_event (
        chat_id TEXT NOT NULL REFERENCES chat (id) ON DELETE CASCADE,
        event_index INTEGER NOT NULL,
        event TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (chat_id, event_index)
      );
    `);
  } catch (error) {
    connection.close();
    throw error;
  }
  // Cached only once set up, so a failed first attempt is retried on the next call.
  database = connection;
  return database;
}

function transaction<T>(work: () => T): T {
  const connection = db();
  connection.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    connection.exec("COMMIT");
    return result;
  } catch (error) {
    // SQLite has already rolled back after some errors (SQLITE_FULL); a second
    // ROLLBACK would throw "no transaction is active" and hide the real error.
    if (connection.isTransaction) connection.exec("ROLLBACK");
    throw error;
  }
}

/**
 * For `/api/health`: whether the chat database opens and answers a read. A
 * missing volume, a file that is not a database or a broken schema fail it.
 */
export function probeChatDatabase() {
  try {
    db().prepare("SELECT 1 FROM chat LIMIT 1").get();
    return true;
  } catch (error) {
    console.error("[health] chat database unavailable", error);
    return false;
  }
}

type ChatRow = { id: string; title: string; updated_at: number };
const toListItem = (row: ChatRow): ChatListItem => ({
  id: String(row.id),
  title: String(row.title),
  updatedAt: new Date(Number(row.updated_at)).toISOString(),
});

function owned(chatId: string, userId: string) {
  return Boolean(
    db().prepare("SELECT 1 FROM chat WHERE id = ? AND user_id = ?").get(chatId, userId),
  );
}

function requireOwned(chatId: string, userId: string) {
  if (!owned(chatId, userId)) throw new Error("Chat not found.");
}

function upsertEvents(chatId: string, events: readonly MessageStreamEvent[], startIndex: number) {
  const statement = db().prepare(
    "INSERT INTO chat_event (chat_id, event_index, event, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(chat_id, event_index) DO UPDATE SET event = excluded.event",
  );
  const now = Date.now();
  events.forEach((event, offset) =>
    statement.run(chatId, startIndex + offset, JSON.stringify(event), now),
  );
}

export async function listChatsByUser(userId: string): Promise<ChatListItem[]> {
  return [...(await listChatsPageByUser(userId)).items];
}

export async function listChatsPageByUser(
  userId: string,
  cursor?: string | null,
  limit: number = CHAT_PAGE_SIZE,
): Promise<ChatListPage> {
  const size = chatPageSize(limit);
  const [updatedRaw, cursorId] = cursor?.trim().split("::") ?? [];
  const cursorUpdated = updatedRaw ? Date.parse(updatedRaw) : Number.NaN;
  const rows = (
    Number.isFinite(cursorUpdated) && cursorId
      ? db()
          .prepare(
            "SELECT id, title, updated_at FROM chat WHERE user_id = ? AND (updated_at < ? OR (updated_at = ? AND id < ?)) ORDER BY updated_at DESC, id DESC LIMIT ?",
          )
          .all(userId, cursorUpdated, cursorUpdated, cursorId, size + 1)
      : db()
          .prepare(
            "SELECT id, title, updated_at FROM chat WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?",
          )
          .all(userId, size + 1)
  ) as ChatRow[];
  const page = rows.slice(0, size);
  const last = page.at(-1);
  return {
    items: page.map(toListItem),
    nextCursor:
      rows.length > size && last
        ? `${new Date(Number(last.updated_at)).toISOString()}::${last.id}`
        : null,
  };
}

export async function createChat(
  userId: string,
  {
    pendingUserMessage,
    title,
  }: { readonly pendingUserMessage?: string; readonly title?: string } = {},
) {
  const pending = pendingUserMessage?.trim() || null;
  const now = Date.now();
  const row: ChatRow = {
    id: randomUUID(),
    title: title?.trim() || (pending ? createFallbackTitle(pending) : DEFAULT_CHAT_TITLE),
    updated_at: now,
  };
  db()
    .prepare(
      "INSERT INTO chat (id, user_id, title, pending_user_message, pending_created_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run(row.id, userId, row.title, pending, pending ? now : null, now, now);
  return toListItem(row);
}

export async function chatExistsForUser(chatId: string, userId: string) {
  return owned(chatId, userId);
}

export async function getChatForUser(chatId: string, userId: string): Promise<ActiveChat | null> {
  const row = db()
    .prepare(
      "SELECT id, title, eve_session, pending_user_message, pending_created_at FROM chat WHERE id = ? AND user_id = ?",
    )
    .get(chatId, userId) as
    | {
        id: string;
        title: string;
        eve_session: string | null;
        pending_user_message: string | null;
        pending_created_at: number | null;
      }
    | undefined;
  if (!row) return null;
  const eventRows = db()
    .prepare("SELECT event, created_at FROM chat_event WHERE chat_id = ? ORDER BY event_index")
    .all(chatId) as { event: string; created_at: number }[];
  const events = eventRows.map((eventRow) => JSON.parse(eventRow.event) as MessageStreamEvent);
  const pendingSince = row.pending_created_at;
  const turnSettled =
    pendingSince !== null &&
    eventRows.some(
      (eventRow, index) =>
        Number(eventRow.created_at) >= Number(pendingSince) &&
        isChatTurnSettledEvent(events[index]!),
    );
  return {
    events,
    id: String(row.id),
    pendingUserMessage: turnSettled ? null : row.pending_user_message,
    session: row.eve_session ? (JSON.parse(row.eve_session) as ClientSessionState) : undefined,
    title: String(row.title),
  };
}

export async function markChatPendingMessage({
  chatId,
  message,
  userId,
}: {
  readonly chatId: string;
  readonly message: string;
  readonly userId: string;
}) {
  const pending = message.trim();
  if (!pending) throw new Error("Message cannot be empty.");
  const now = Date.now();
  const row = db()
    .prepare(
      "UPDATE chat SET pending_user_message = ?, pending_created_at = ?, updated_at = ?, title = CASE WHEN title = ? THEN ? ELSE title END WHERE id = ? AND user_id = ? RETURNING id, title, updated_at",
    )
    .get(pending, now, now, DEFAULT_CHAT_TITLE, createFallbackTitle(pending), chatId, userId) as
    | ChatRow
    | undefined;
  if (!row) throw new Error("Chat not found.");
  return toListItem(row);
}

export async function clearChatPendingMessage({
  chatId,
  userId,
}: {
  readonly chatId: string;
  readonly userId: string;
}) {
  db()
    .prepare(
      "UPDATE chat SET pending_user_message = NULL, pending_created_at = NULL WHERE id = ? AND user_id = ?",
    )
    .run(chatId, userId);
}

export async function skipChatAuthorization({
  chatId,
  events,
  session,
  userId,
}: {
  readonly chatId: string;
  readonly events: readonly MessageStreamEvent[];
  readonly session: ClientSessionState | undefined;
  readonly userId: string;
}) {
  if (events.length === 0) throw new Error("No authorization events to save.");
  return transaction(() => {
    requireOwned(chatId, userId);
    const last = db()
      .prepare("SELECT MAX(event_index) AS last FROM chat_event WHERE chat_id = ?")
      .get(chatId) as { last: number | null };
    const eventIndex = (last.last ?? -1) + 1;
    upsertEvents(chatId, events, eventIndex);
    const row = db()
      .prepare(
        "UPDATE chat SET eve_session = ?, pending_user_message = NULL, pending_created_at = NULL, updated_at = ? WHERE id = ? AND user_id = ? RETURNING id, title, updated_at",
      )
      .get(session ? JSON.stringify(session) : null, Date.now(), chatId, userId) as ChatRow;
    return { chat: toListItem(row), eventCount: events.length, eventIndex };
  });
}

export async function saveChatSessionState({
  chatId,
  session,
  userId,
}: {
  readonly chatId: string;
  readonly session: ClientSessionState;
  readonly userId: string;
}) {
  db()
    .prepare("UPDATE chat SET eve_session = ? WHERE id = ? AND user_id = ?")
    .run(JSON.stringify(session), chatId, userId);
}

/** Forgets an eve session that can no longer take messages in every chat of the user. */
export async function forgetChatSession({
  sessionId,
  userId,
}: {
  readonly sessionId: string;
  readonly userId: string;
}) {
  db()
    .prepare(
      "UPDATE chat SET eve_session = NULL WHERE user_id = ? AND json_extract(eve_session, '$.sessionId') = ?",
    )
    .run(userId, sessionId);
}

export async function appendChatEvent({
  chatId,
  event,
  eventIndex,
  userId,
}: {
  readonly chatId: string;
  readonly event: MessageStreamEvent;
  readonly eventIndex: number;
  readonly userId: string;
}) {
  requireOwned(chatId, userId);
  upsertEvents(chatId, [event], eventIndex);
}

/**
 * Saves the chat's events from `fromIndex` on (earlier rows are unchanged) and
 * drops any rows past the new end.
 */
export async function saveChatSnapshot({
  chatId,
  events,
  fromIndex = 0,
  session,
  userId,
}: {
  readonly chatId: string;
  readonly events: readonly MessageStreamEvent[];
  readonly fromIndex?: number;
  readonly session: ClientSessionState | undefined;
  readonly userId: string;
}) {
  transaction(() => {
    requireOwned(chatId, userId);
    upsertEvents(chatId, events, fromIndex);
    db()
      .prepare("DELETE FROM chat_event WHERE chat_id = ? AND event_index >= ?")
      .run(chatId, fromIndex + events.length);
    db()
      .prepare(
        "UPDATE chat SET eve_session = ?, pending_user_message = NULL, pending_created_at = NULL, updated_at = ? WHERE id = ? AND user_id = ?",
      )
      .run(session ? JSON.stringify(session) : null, Date.now(), chatId, userId);
  });
}

export async function renameChatForUser(chatId: string, userId: string, title: string) {
  // Leaves updated_at alone: a rename should not reorder the history.
  const result = db()
    .prepare("UPDATE chat SET title = ? WHERE id = ? AND user_id = ?")
    .run(title, chatId, userId);
  return result.changes > 0;
}

export async function deleteChatForUser(chatId: string, userId: string) {
  db().prepare("DELETE FROM chat WHERE id = ? AND user_id = ?").run(chatId, userId);
}
