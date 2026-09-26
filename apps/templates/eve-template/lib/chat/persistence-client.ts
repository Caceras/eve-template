"use client";

import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import {
  appendChatEventAction,
  checkSendLimitAction,
  clearChatPendingMessageAction,
  createChatAction,
  deleteChatAction,
  forgetChatSessionAction,
  markChatPendingMessageAction,
  renameChatAction,
  saveChatSessionStateAction,
  saveChatSnapshotAction,
  skipChatAuthorizationAction,
} from "@/app/actions/chat";
import {
  appendLocalChatEvent,
  clearLocalChatPendingMessage,
  createLocalChat,
  deleteLocalChat,
  forgetLocalChatSession,
  getLocalChat,
  listLocalChats,
  markLocalChatPendingMessage,
  renameLocalChat,
  saveLocalChatSession,
  saveLocalChatSnapshot,
  skipLocalChatAuthorization,
} from "@/lib/chat/local-store";
import {
  ChatActionError,
  OFFLINE_MESSAGE,
  callChatAction,
  isOfflineError,
} from "@/lib/chat/errors";
import { normalizeChatTitle } from "@/lib/chat/rename";
import type { StorageMode } from "@/lib/chat/types";

// Server actions return { ok, code, message }; these helpers throw a
// ChatActionError with that readable message and code instead.

export function listClientChats(storageMode: StorageMode) {
  return storageMode === "browser" ? listLocalChats() : [];
}

export async function getClientChat(storageMode: StorageMode, chatId: string) {
  if (storageMode === "browser") {
    return getLocalChat(chatId);
  }

  let response: Response;
  try {
    response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
  } catch (error) {
    throw isOfflineError(error)
      ? new ChatActionError("offline", OFFLINE_MESSAGE)
      : new ChatActionError("failed", "Failed to load chat history.");
  }

  if (!response.ok) {
    if (response.status === 401)
      throw new ChatActionError(
        "unauthorized",
        "Your sign-in has expired. Sign in again to continue.",
      );
    throw response.status === 404
      ? new ChatActionError("not_found", "Chat not found.")
      : new ChatActionError("failed", "Failed to load chat history.");
  }

  const data = (await response.json()) as {
    readonly chat: ReturnType<typeof getLocalChat>;
  };

  return data.chat;
}

export async function createClientChat(
  storageMode: StorageMode,
  input?: { readonly pendingUserMessage?: string },
) {
  return storageMode === "browser"
    ? createLocalChat(input?.pendingUserMessage)
    : callChatAction(() => createChatAction(input));
}

/** Returns the title as stored. */
export async function renameClientChat(storageMode: StorageMode, chatId: string, title: string) {
  if (storageMode !== "browser") return callChatAction(() => renameChatAction(chatId, title));
  const next = normalizeChatTitle(title);
  if (!next) throw new Error("Give the chat a name.");
  renameLocalChat(chatId, next);
  return next;
}

export async function deleteClientChat(storageMode: StorageMode, chatId: string) {
  if (storageMode === "browser") {
    deleteLocalChat(chatId);
    return;
  }

  await callChatAction(() => deleteChatAction(chatId));
}

export async function checkClientSendLimit(
  storageMode: StorageMode,
  input?: { readonly message?: string },
): Promise<
  | { readonly allowed: true }
  | { readonly allowed: false; readonly message: string; readonly retryAfter: number }
> {
  if (storageMode === "browser") return { allowed: true };
  try {
    await callChatAction(() => checkSendLimitAction(input));
    return { allowed: true };
  } catch (error) {
    if (error instanceof ChatActionError && error.code === "rate_limited")
      return { allowed: false, message: error.message, retryAfter: error.retryAfter ?? 60 };
    throw error;
  }
}

export async function markClientChatPendingMessage(
  storageMode: StorageMode,
  input: { readonly chatId: string; readonly message: string },
) {
  return storageMode === "browser"
    ? markLocalChatPendingMessage(input.chatId, input.message)
    : callChatAction(() => markChatPendingMessageAction(input));
}

export async function clearClientChatPendingMessage(storageMode: StorageMode, chatId: string) {
  if (storageMode === "browser") {
    clearLocalChatPendingMessage(chatId);
    return;
  }

  await callChatAction(() => clearChatPendingMessageAction(chatId));
}

export async function appendClientChatEvent(
  storageMode: StorageMode,
  input: {
    readonly chatId: string;
    readonly event: MessageStreamEvent;
    readonly eventIndex: number;
  },
) {
  if (storageMode === "browser") {
    appendLocalChatEvent(input);
    return;
  }

  await callChatAction(() => appendChatEventAction(input));
}

export async function saveClientChatSession(
  storageMode: StorageMode,
  input: { readonly chatId: string; readonly session: ClientSessionState },
) {
  if (storageMode === "browser") {
    saveLocalChatSession(input.chatId, input.session);
    return;
  }

  await callChatAction(() => saveChatSessionStateAction(input));
}

/** Forgets an eve session that can no longer take messages in every chat that uses it. */
export async function forgetClientChatSession(storageMode: StorageMode, sessionId: string) {
  if (storageMode === "browser") {
    forgetLocalChatSession(sessionId);
    return;
  }

  await callChatAction(() => forgetChatSessionAction(sessionId));
}

/**
 * Saves a settled chat. `unchanged` counts leading events the server already
 * has, so only the new turn is uploaded instead of the whole history.
 */
export async function saveClientChatSnapshot(
  storageMode: StorageMode,
  input: {
    readonly chatId: string;
    readonly events: readonly MessageStreamEvent[];
    readonly session: ClientSessionState | undefined;
    readonly unchanged?: number;
  },
) {
  const { unchanged = 0, ...snapshot } = input;

  if (storageMode === "browser") {
    saveLocalChatSnapshot(snapshot);
    return;
  }

  await callChatAction(() =>
    saveChatSnapshotAction({
      chatId: snapshot.chatId,
      events: snapshot.events.slice(unchanged),
      fromIndex: unchanged,
      session: snapshot.session,
    }),
  );
}

export async function skipClientChatAuthorization(
  storageMode: StorageMode,
  input: {
    readonly chatId: string;
    readonly events: readonly MessageStreamEvent[];
    readonly session: ClientSessionState | undefined;
  },
) {
  return storageMode === "browser"
    ? skipLocalChatAuthorization(input)
    : callChatAction(() => skipChatAuthorizationAction(input));
}

/** Shared bounded paging for navigation/search; the server scopes every page to the viewer. */
export async function listClientChatsPage(storageMode: StorageMode, cursor: string | null = null) {
  if (storageMode === "browser") return { items: listLocalChats(), nextCursor: null };
  const response = await fetch(
    `/api/chats${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
    { cache: "no-store" },
  );
  if (!response.ok) throw new Error("Could not load conversations.");
  const data = await response.json();
  return {
    items: data.chats as import("./types").ChatListItem[],
    nextCursor: data.nextCursor as string | null,
  };
}
