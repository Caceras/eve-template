"use server";

import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import {
  appendChatEvent,
  clearChatPendingMessage,
  createChat,
  deleteChatForUser,
  forgetChatSession,
  listChatsByUser,
  markChatPendingMessage,
  renameChatForUser,
  saveChatSnapshot,
  saveChatSessionState,
  skipChatAuthorization,
} from "@/lib/db/queries";
import type { ChatActionCode, ChatActionResult } from "@/lib/chat/errors";
import { getChatMessageLengthError } from "@/lib/chat/limits";
import { normalizeChatTitle } from "@/lib/chat/rename";
import type { Viewer } from "@/lib/chat/types";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

const SEND_LIMIT = 25;
const SEND_WINDOW_SECONDS = 60 * 60;

// Every action returns { ok, code, message } instead of throwing: production
// builds replace a thrown action error with a generic React message, and an
// expired sign-in must reach the page as such so it can ask to sign in again.

/** A failure the person can act on, raised inside an action. */
class ChatInputError extends Error {
  readonly code: ChatActionCode;

  constructor(code: ChatActionCode, message: string) {
    super(message);
    this.code = code;
  }
}

function assertMessageLength(message: string) {
  const error = getChatMessageLengthError(message);
  if (error) throw new ChatInputError("invalid", error);
}

async function forViewer<T>(work: (viewer: Viewer) => Promise<T>): Promise<ChatActionResult<T>> {
  try {
    const setupStatus = await getSetupStatus();

    if (setupStatus.storageMode !== "database") {
      return { ok: false, code: "unavailable", message: "This server does not keep chat history." };
    }

    const viewer = await getServerViewer(setupStatus);

    if (!viewer) {
      return {
        ok: false,
        code: "unauthorized",
        message: "Your sign-in has expired. Sign in again to continue.",
      };
    }

    return { ok: true, value: await work(viewer) };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        ok: false,
        code: "rate_limited",
        message: `${error.message} Retry in ${error.retryAfter}s.`,
        retryAfter: error.retryAfter,
      };
    }
    if (error instanceof ChatInputError) {
      return { ok: false, code: error.code, message: error.message };
    }
    if (error instanceof Error && error.message === "Chat not found.") {
      return { ok: false, code: "not_found", message: "This chat no longer exists." };
    }
    console.error("[chat] action failed", error);
    return {
      ok: false,
      code: "failed",
      message: "Ægentica could not save the chat. Try again in a moment.",
    };
  }
}

export async function createChatAction(input?: { readonly pendingUserMessage?: string }) {
  return forViewer(async (viewer) => {
    if (input?.pendingUserMessage) {
      assertMessageLength(input.pendingUserMessage);
    }

    await enforceRateLimit({
      key: viewer.id,
      limit: SEND_LIMIT,
      prefix: "chat:create",
      windowSeconds: SEND_WINDOW_SECONDS,
    });

    return createChat(viewer.id, {
      pendingUserMessage: input?.pendingUserMessage,
    });
  });
}

export async function checkSendLimitAction(input?: { readonly message?: string }) {
  return forViewer(async (viewer) => {
    if (input?.message) {
      assertMessageLength(input.message);
    }

    await enforceRateLimit({
      key: viewer.id,
      limit: SEND_LIMIT,
      prefix: "chat:send",
      windowSeconds: SEND_WINDOW_SECONDS,
    });

    return true;
  });
}

export async function saveChatSnapshotAction(input: {
  readonly chatId: string;
  readonly events: readonly MessageStreamEvent[];
  readonly fromIndex?: number;
  readonly session: ClientSessionState | undefined;
}) {
  return forViewer(async (viewer) => {
    const fromIndex = input.fromIndex ?? 0;

    if (!Number.isSafeInteger(fromIndex) || fromIndex < 0) {
      throw new ChatInputError("invalid", "Invalid chat snapshot.");
    }

    await saveChatSnapshot({
      chatId: input.chatId,
      events: input.events,
      fromIndex,
      session: input.session,
      userId: viewer.id,
    });

    return true;
  });
}

export async function markChatPendingMessageAction(input: {
  readonly chatId: string;
  readonly message: string;
}) {
  return forViewer(async (viewer) => {
    assertMessageLength(input.message);

    return markChatPendingMessage({
      chatId: input.chatId,
      message: input.message,
      userId: viewer.id,
    });
  });
}

export async function clearChatPendingMessageAction(chatId: string) {
  return forViewer(async (viewer) => {
    await clearChatPendingMessage({
      chatId,
      userId: viewer.id,
    });

    return true;
  });
}

export async function skipChatAuthorizationAction(input: {
  readonly chatId: string;
  readonly events: readonly MessageStreamEvent[];
  readonly session: ClientSessionState | undefined;
}) {
  return forViewer((viewer) =>
    skipChatAuthorization({
      chatId: input.chatId,
      events: input.events,
      session: input.session,
      userId: viewer.id,
    }),
  );
}

export async function appendChatEventAction(input: {
  readonly chatId: string;
  readonly event: MessageStreamEvent;
  readonly eventIndex: number;
}) {
  return forViewer(async (viewer) => {
    await appendChatEvent({
      chatId: input.chatId,
      event: input.event,
      eventIndex: input.eventIndex,
      userId: viewer.id,
    });

    return true;
  });
}

export async function saveChatSessionStateAction(input: {
  readonly chatId: string;
  readonly session: ClientSessionState;
}) {
  return forViewer(async (viewer) => {
    await saveChatSessionState({
      chatId: input.chatId,
      session: input.session,
      userId: viewer.id,
    });

    return true;
  });
}

export async function forgetChatSessionAction(sessionId: string) {
  return forViewer(async (viewer) => {
    if (typeof sessionId !== "string" || !sessionId.trim()) {
      throw new ChatInputError("invalid", "Invalid session.");
    }

    await forgetChatSession({ sessionId: sessionId.trim(), userId: viewer.id });

    return true;
  });
}

/** Copies one chat kept in browser storage (before server history existed) to the server. */
export async function importBrowserChatAction(input: {
  readonly title: string;
  readonly events: readonly MessageStreamEvent[];
  readonly session: ClientSessionState | undefined;
}) {
  return forViewer(async (viewer) => {
    if (input.events.length === 0) return null;
    const chat = await createChat(viewer.id, { title: input.title.slice(0, 200) });
    await saveChatSnapshot({
      chatId: chat.id,
      events: input.events,
      session: input.session,
      userId: viewer.id,
    });
    return chat;
  });
}

export async function renameChatAction(chatId: string, title: string) {
  return forViewer(async (viewer) => {
    const next = typeof title === "string" ? normalizeChatTitle(title) : null;

    if (!next) {
      throw new ChatInputError("invalid", "Give the chat a name.");
    }

    if (!(await renameChatForUser(String(chatId), viewer.id, next))) {
      throw new ChatInputError("not_found", "This chat no longer exists.");
    }

    return next;
  });
}

export async function deleteChatAction(chatId: string) {
  return forViewer(async (viewer) => {
    await deleteChatForUser(chatId, viewer.id);

    return listChatsByUser(viewer.id);
  });
}
