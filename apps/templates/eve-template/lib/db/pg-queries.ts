import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, exists, gte, lt, or, type SQL, sql } from "drizzle-orm";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { isChatTurnSettledEvent } from "@/lib/chat/events";
import { CHAT_PAGE_SIZE, chatPageSize } from "@/lib/chat/paging";
import type { ActiveChat, ChatListItem, ChatListPage } from "@/lib/chat/types";
import { createFallbackTitle, DEFAULT_CHAT_TITLE } from "@/lib/chat/title";
import { chat, chatEvent, user } from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { OPERATOR_PRINCIPAL_ID } from "@/lib/operator";

function encodeChatCursor(updatedAt: Date, id: string) {
  return `${updatedAt.toISOString()}::${id}`;
}

function decodeChatCursor(cursor: string) {
  const [updatedAtRaw, id] = cursor.split("::");

  if (!updatedAtRaw || !id) {
    return null;
  }

  const updatedAt = new Date(updatedAtRaw);

  if (Number.isNaN(updatedAt.getTime())) {
    return null;
  }

  return { id, updatedAt };
}

/*
 * neon-http has no interactive transactions, but `db.batch` runs its statements
 * as one transaction. Statements in a batch cannot read each other's results,
 * so ownership is checked inside every write: for a chat that is not the
 * caller's, the batch changes nothing and the lock query comes back empty.
 */

/** Locks the caller's chat row until the batch commits; empty when not theirs. */
function lockOwnedChat(chatId: string, userId: string) {
  return db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .for("update");
}

/** Upserts `events` at `firstIndex`, `firstIndex + 1`, … when the chat is the caller's. */
function insertOwnedEvents({
  chatId,
  events,
  firstIndex,
  userId,
}: {
  readonly chatId: string;
  readonly events: readonly MessageStreamEvent[];
  readonly firstIndex: SQL;
  readonly userId: string;
}) {
  const rows = JSON.stringify(events.map((event) => ({ event, id: randomUUID() })));
  return db.execute<{ event_index: number }>(sql`
    insert into chat_event (id, chat_id, event_index, event)
    select item.value->>'id', ${chatId}, (${firstIndex} + item.position - 1)::integer, item.value->'event'
    from jsonb_array_elements(${rows}::jsonb) with ordinality as item(value, position)
    where exists (select 1 from "chat" where id = ${chatId} and user_id = ${userId})
    on conflict (chat_id, event_index) do update set event = excluded.event
    returning event_index
  `);
}

/**
 * Password sign-in and scheduled tasks use the operator principal, which never
 * signs up through Better Auth, but `chat.user_id` references "user". Its row
 * is created once, before the operator's first chat.
 */
let operatorUserSaved = false;
async function ensureUserRow(userId: string) {
  if (userId !== OPERATOR_PRINCIPAL_ID || operatorUserSaved) return;
  await db
    .insert(user)
    .values({ email: "local@aegentica.local", id: OPERATOR_PRINCIPAL_ID, name: "Operator" })
    .onConflictDoNothing({ target: user.id });
  operatorUserSaved = true;
}

export async function listChatsByUser(userId: string): Promise<ChatListItem[]> {
  const page = await listChatsPageByUser(userId);

  return [...page.items];
}

export async function listChatsPageByUser(
  userId: string,
  cursor?: string | null,
  limit: number = CHAT_PAGE_SIZE,
): Promise<ChatListPage> {
  const size = chatPageSize(limit);
  const cursorValue = cursor?.trim();
  const parsedCursor = cursorValue ? decodeChatCursor(cursorValue) : null;
  const rows = await db
    .select({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
    })
    .from(chat)
    .where(
      and(
        eq(chat.userId, userId),
        parsedCursor
          ? or(
              lt(chat.updatedAt, parsedCursor.updatedAt),
              and(eq(chat.updatedAt, parsedCursor.updatedAt), lt(chat.id, parsedCursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(chat.updatedAt), desc(chat.id))
    .limit(size + 1);

  const hasMore = rows.length > size;
  const pageRows = hasMore ? rows.slice(0, size) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor: hasMore && last ? encodeChatCursor(last.updatedAt, last.id) : null,
  };
}

export async function createChat(
  userId: string,
  {
    pendingUserMessage,
    title,
  }: {
    readonly pendingUserMessage?: string;
    readonly title?: string;
  } = {},
) {
  const pendingMessage = pendingUserMessage?.trim();
  const pendingMessageCreatedAt = pendingMessage ? new Date() : null;
  await ensureUserRow(userId);
  const [row] = await db
    .insert(chat)
    .values({
      id: randomUUID(),
      pendingUserMessage: pendingMessage || null,
      pendingUserMessageCreatedAt: pendingMessageCreatedAt,
      title:
        title?.trim() ||
        (pendingMessage ? createFallbackTitle(pendingMessage) : DEFAULT_CHAT_TITLE),
      userId,
    })
    .returning({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
    });

  if (!row) {
    throw new Error("Failed to create chat.");
  }

  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function chatExistsForUser(chatId: string, userId: string) {
  const [row] = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);
  return Boolean(row);
}

export async function getChatForUser(chatId: string, userId: string): Promise<ActiveChat | null> {
  const [row] = await db
    .select({
      id: chat.id,
      title: chat.title,
      eveSession: chat.eveSession,
      pendingUserMessage: chat.pendingUserMessage,
      pendingUserMessageCreatedAt: chat.pendingUserMessageCreatedAt,
    })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const events = await db
    .select({
      createdAt: chatEvent.createdAt,
      event: chatEvent.event,
    })
    .from(chatEvent)
    .where(eq(chatEvent.chatId, chatId))
    .orderBy(asc(chatEvent.eventIndex));

  const eventValues = events.map((eventRow) => eventRow.event);
  const pendingMessageCreatedAt = row.pendingUserMessageCreatedAt;
  const hasCurrentTurnCompleted = Boolean(
    pendingMessageCreatedAt &&
    events.some(
      (eventRow) =>
        eventRow.createdAt >= pendingMessageCreatedAt && isChatTurnSettledEvent(eventRow.event),
    ),
  );

  return {
    events: eventValues,
    id: row.id,
    pendingUserMessage: hasCurrentTurnCompleted ? null : row.pendingUserMessage,
    session: row.eveSession ?? undefined,
    title: row.title,
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
  const pendingMessage = message.trim();

  if (!pendingMessage) {
    throw new Error("Message cannot be empty.");
  }

  const [row] = await db
    .update(chat)
    .set({
      pendingUserMessage: pendingMessage,
      pendingUserMessageCreatedAt: new Date(),
      title: sql<string>`
        case
          when ${chat.title} = ${DEFAULT_CHAT_TITLE}
          then ${createFallbackTitle(pendingMessage)}
          else ${chat.title}
        end
      `,
      updatedAt: new Date(),
    })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
    });

  if (!row) {
    throw new Error("Chat not found.");
  }

  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function clearChatPendingMessage({
  chatId,
  userId,
}: {
  readonly chatId: string;
  readonly userId: string;
}) {
  await db
    .update(chat)
    .set({
      pendingUserMessage: null,
      pendingUserMessageCreatedAt: null,
    })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
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
  if (events.length === 0) {
    throw new Error("No authorization events to save.");
  }

  // One transaction: the events go after the last saved one, counted in SQL
  // after the chat row is locked, so two saves of one chat never pick the
  // same indexes and overwrite each other.
  const [locked, inserted, updated] = await db.batch([
    lockOwnedChat(chatId, userId),
    insertOwnedEvents({
      chatId,
      events,
      firstIndex: sql`(select coalesce(max(event_index), -1) + 1 from chat_event where chat_id = ${chatId})`,
      userId,
    }),
    db
      .update(chat)
      .set({
        eveSession: session ?? null,
        pendingUserMessage: null,
        pendingUserMessageCreatedAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
      .returning({
        id: chat.id,
        title: chat.title,
        updatedAt: chat.updatedAt,
      }),
  ]);
  const [row] = updated;

  if (locked.length === 0 || !row) {
    throw new Error("Chat not found.");
  }

  const eventIndex = Math.min(...inserted.rows.map((saved) => Number(saved.event_index)));

  return {
    chat: {
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    },
    eventCount: events.length,
    eventIndex,
  };
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
  await db
    .update(chat)
    .set({
      eveSession: session,
    })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}

/**
 * Forgets an eve session that can no longer take messages (ended, or reset
 * from Activity) in every chat of the user that uses it, so the chat's next
 * message starts a new session instead of failing.
 */
export async function forgetChatSession({
  sessionId,
  userId,
}: {
  readonly sessionId: string;
  readonly userId: string;
}) {
  await db
    .update(chat)
    .set({ eveSession: null })
    .where(and(eq(chat.userId, userId), sql`${chat.eveSession}->>'sessionId' = ${sessionId}`));
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
  const [ownedChat] = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!ownedChat) {
    throw new Error("Chat not found.");
  }

  await db
    .insert(chatEvent)
    .values({
      chatId,
      event,
      eventIndex,
      id: randomUUID(),
    })
    .onConflictDoUpdate({
      set: { event },
      target: [chatEvent.chatId, chatEvent.eventIndex],
    });
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
  const owned = and(eq(chat.id, chatId), eq(chat.userId, userId));
  // One transaction, like the SQLite store: a failed step leaves the chat as
  // it was instead of new events with a stale tail or session.
  const [locked] = await db.batch([
    lockOwnedChat(chatId, userId),
    insertOwnedEvents({ chatId, events, firstIndex: sql`${fromIndex}::integer`, userId }),
    db
      .delete(chatEvent)
      .where(
        and(
          eq(chatEvent.chatId, chatId),
          gte(chatEvent.eventIndex, fromIndex + events.length),
          exists(db.select({ id: chat.id }).from(chat).where(owned)),
        ),
      ),
    db
      .update(chat)
      .set({
        eveSession: session ?? null,
        pendingUserMessage: null,
        pendingUserMessageCreatedAt: null,
        updatedAt: new Date(),
      })
      .where(owned),
  ]);

  if (locked.length === 0) {
    throw new Error("Chat not found.");
  }
}

export async function renameChatForUser(chatId: string, userId: string, title: string) {
  // Leaves updatedAt alone: a rename should not reorder the history.
  const rows = await db
    .update(chat)
    .set({ title })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning({ id: chat.id });
  return rows.length > 0;
}

export async function deleteChatForUser(chatId: string, userId: string) {
  await db.delete(chat).where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}
