"use client";
import {
  composerHeaders,
  composerTurn,
  clearComposerFiles,
  readComposerDraft,
} from "@/lib/chat/composer-draft";

import { Client, ClientError } from "eve/client";
import type {
  AuthorizationRequiredStreamEvent,
  ClientSession,
  ClientSessionState,
  EveMessageData,
  MessageStreamEvent,
} from "eve/client";
import type { EveMessage } from "eve/react";
import { defaultMessageReducer } from "eve/react";
import { useEveAgent } from "@/lib/chat/use-reliable-eve-agent";
import { ExternalLinkIcon, PlugIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useChatShell, type EnabledConnections } from "@/app/_components/chat-shell-context";
import {
  ChatConversation,
  ChatConversationContent,
  ChatScrollButton,
} from "@/components/chat/conversation";
import { AgentMessage, type AgentInputResponse } from "@/components/chat/message";
import { ThinkingLine } from "@/components/chat/pending-turn";
import { ErrorToast } from "@/components/chat/error-toast";
import { describeTurnFailure } from "@/lib/turn-failure";
import { Button } from "@/components/ui/button";
import {
  compactStreamFragments,
  createSeenEvents,
  hasSeen,
  isStreamFragment,
  markSeen,
  receivedUserText,
  type SeenEvents,
} from "@/lib/chat/event-log";
import { isChatTurnSettledEvent } from "@/lib/chat/events";
import { isSignInError, readableChatError } from "@/lib/chat/errors";
import { getChatMessageLengthError } from "@/lib/chat/limits";
import {
  appendClientChatEvent,
  checkClientSendLimit,
  clearClientChatPendingMessage,
  createClientChat,
  forgetClientChatSession,
  markClientChatPendingMessage,
  saveClientChatSession,
  saveClientChatSnapshot,
} from "@/lib/chat/persistence-client";
import type { ActiveChat, SetupStatus } from "@/lib/chat/types";

export type DraftHandlers = {
  readonly clearDraft: () => void;
  readonly restoreDraft: (value: string) => void;
};

export type AgentChatController = {
  readonly reset: () => void;
  readonly sendMessage: (text: string, draftHandlers: DraftHandlers) => Promise<void>;
  readonly stop: () => void;
};

export type AgentChatControllerStatus = {
  readonly canSteer: boolean;
  readonly disabledReason?: string;
  readonly isBusy: boolean;
  readonly isDisabled: boolean;
  readonly isEmpty: boolean;
  /**
   * The chat is still reading its session from the saved cursor. A message
   * that was pending when the page closed is sent again only after this, and
   * only if eve never received it.
   */
  readonly isSyncing: boolean;
};

const IDLE_CONTROLLER_STATUS: AgentChatControllerStatus = {
  canSteer: false,
  isBusy: false,
  isDisabled: false,
  isEmpty: true,
  isSyncing: false,
};

const THINKING_EXIT_DURATION_MS = 180;

function attachClientSession(session: ClientSessionState | undefined): ClientSession | null {
  if (!session) return null;
  return new Client({ host: "" }).sessions.attach(session.sessionId, {
    streamIndex: session.streamIndex,
  });
}

const messageReducer = defaultMessageReducer();

function reduceEventsToMessageData(
  events: readonly MessageStreamEvent[],
  data: EveMessageData = messageReducer.initial(),
): EveMessageData {
  for (const event of events) {
    data = messageReducer.reduce(data, event);
  }

  return data;
}

/**
 * The chat's messages: the saved history is reduced once per save, and each
 * event that arrives is applied on top of the last result rather than
 * reducing the whole chat again (eve's reducer keeps unchanged messages as
 * they were, so memoized rows skip them).
 */
function useMessageData(
  knownEvents: readonly MessageStreamEvent[],
  liveEvents: readonly MessageStreamEvent[],
) {
  const knownData = useMemo(() => reduceEventsToMessageData(knownEvents), [knownEvents]);
  const last = useRef<{
    readonly base: EveMessageData;
    readonly data: EveMessageData;
    readonly events: readonly MessageStreamEvent[];
  } | null>(null);

  return useMemo(() => {
    const previous = last.current;
    const extends_ =
      previous?.base === knownData &&
      previous.events.length <= liveEvents.length &&
      (previous.events.length === 0 ||
        liveEvents[previous.events.length - 1] === previous.events.at(-1));
    const data = extends_
      ? reduceEventsToMessageData(liveEvents.slice(previous.events.length), previous.data)
      : reduceEventsToMessageData(liveEvents, knownData);
    last.current = { base: knownData, data, events: liveEvents };
    return data;
  }, [knownData, liveEvents]);
}

/** A row re-renders only when its message, state or place in the chat changes. */
const ChatMessage = memo(AgentMessage);

/** The last message is a reply whose last part is still visibly arriving. */
function isReplyInProgress(message: EveMessage | undefined) {
  if (message?.role !== "assistant") return false;
  const part = message.parts.at(-1);
  if (!part) return false;
  if (part.type === "text") return part.state === "streaming" && part.text.length > 0;
  if (part.type === "reasoning") return part.state === "streaming";
  if (part.type === "dynamic-tool")
    return part.state !== "output-available" && part.state !== "output-error";
  return false;
}

function hasOpenChatTurn(events: readonly MessageStreamEvent[]) {
  let open = false;

  for (const event of events) {
    if (event.type === "turn.started") {
      open = true;
    } else if (isChatTurnSettledEvent(event)) {
      open = false;
    }
  }

  return open;
}

function namespaceStreamEvent(
  event: MessageStreamEvent,
  namespace: string | undefined,
): MessageStreamEvent {
  if (!namespace) {
    return event;
  }

  if (!("data" in event) || typeof event.data !== "object" || !event.data) {
    return event;
  }

  const data = event.data as { readonly sequence?: unknown; readonly turnId?: unknown };
  // eve 0.67 streams the continuation after an answered question with an empty
  // turn id; give each continuation its own, so replies do not merge.
  const turnId =
    data.turnId === "" && typeof data.sequence === "number"
      ? `continued_${data.sequence}`
      : typeof data.turnId === "string"
        ? data.turnId
        : undefined;

  if (!turnId) {
    return event;
  }

  const prefix = `${namespace}:`;

  if (turnId.startsWith(prefix)) {
    return event;
  }

  return {
    ...event,
    data: {
      ...event.data,
      turnId: `${prefix}${turnId}`,
    },
  } as MessageStreamEvent;
}

/** A chat whose latest turn failed (live, or a saved scheduled run) shows why, readably. */
function lastTurnFailure(events: readonly MessageStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index]!;
    if (event.type === "turn.failed")
      return { raw: event.data.message, text: describeTurnFailure(event.data) };
    if (event.type === "turn.started" || event.type === "turn.completed") return null;
  }
  return null;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

/**
 * eve ends a session for good at its deadline (30 days, `agent/agent.ts`),
 * when it fails, or when Activity resets it; it then refuses every message.
 */
function hasEndedSession(events: readonly MessageStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const type = events[index]!.type;
    if (type === "session.completed" || type === "session.failed") return true;
    if (type === "session.waiting" || type === "turn.started") return false;
  }
  return false;
}

function isEndedSessionError(error: unknown) {
  return (
    error instanceof ClientError &&
    (error.code === "session_not_active" ||
      (error.status === 409 && /no longer active/i.test(error.message)))
  );
}

/** The session a message came from: turn ids carry it as a prefix (namespaceStreamEvent). */
function messageSessionId(message: EveMessage) {
  const turnId = message.metadata?.turnId;
  const separator = turnId?.indexOf(":") ?? -1;
  return turnId && separator > 0 ? turnId.slice(0, separator) : undefined;
}

/** The newer of two cursors of one session; a different session replaces the old one. */
function laterCursor(
  current: ClientSessionState | undefined,
  next: ClientSessionState,
): ClientSessionState {
  return current?.sessionId === next.sessionId && current.streamIndex >= next.streamIndex
    ? current
    : next;
}

export function AgentChatSession({
  activeChat,
  chatId,
  emptyComposer,
  onActiveChatUpdated,
  onPendingUserMessageSettled,
  onControllerChange,
  pendingUserMessage,
}: {
  readonly activeChat: ActiveChat | null;
  readonly chatId?: string | null;
  readonly emptyComposer?: ReactNode;
  readonly onActiveChatUpdated?: (activeChat: ActiveChat) => void;
  readonly onPendingUserMessageSettled?: (message?: string) => void;
  readonly onControllerChange: (
    controller: AgentChatController | null,
    status: AgentChatControllerStatus,
  ) => void;
  readonly pendingUserMessage?: string | null;
}) {
  const {
    activeChatId: shellActiveChatId,
    enabledConnections,
    requestSignIn,
    setActiveChatId: setShellActiveChatId,
    setupStatus,
    touchChat,
    viewer,
  } = useChatShell();
  const [activeChatId, setActiveChatId] = useState(activeChat?.id ?? chatId ?? null);
  const [currentTitle, setCurrentTitle] = useState(activeChat?.title ?? "New chat");
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  // The chat as the server has it, and every event shown since the last save
  // (from this page's own turns or from reading the session).
  const [knownEvents, setKnownEvents] = useState<readonly MessageStreamEvent[]>(
    () => activeChat?.events ?? [],
  );
  const [liveEvents, setLiveEvents] = useState<readonly MessageStreamEvent[]>([]);
  // A send or answer from this page is in flight.
  const [hookTurn, setHookTurn] = useState(false);
  // eve's hook keeps reading the session after this page's own turn, until the page is hidden.
  const [hookFollowing, setHookFollowing] = useState(false);
  const [sessionId, setSessionId] = useState(activeChat?.session?.sessionId);
  const [sessionEnded, setSessionEnded] = useState(() => hasEndedSession(activeChat?.events ?? []));
  const [caughtUpSessionId, setCaughtUpSessionId] = useState<string | null>(null);
  const {
    clearMessage: clearLocalPendingUserMessage,
    message: localPendingUserMessage,
    messageRef: localPendingUserMessageRef,
    setMessage: setLocalPendingUserMessage,
  } = usePendingUserMessage();
  const [skippingAuthorizationKey, setSkippingAuthorizationKey] = useState<string | null>(null);
  const activeChatIdRef = useRef(activeChat?.id ?? chatId ?? null);
  const knownEventsRef = useRef<readonly MessageStreamEvent[]>(knownEvents);
  const liveEventsRef = useRef<readonly MessageStreamEvent[]>([]);
  const seenRef = useRef<SeenEvents | null>(null);
  seenRef.current ??= createSeenEvents(knownEvents);
  // Rows the server holds for this chat; per-event saves append after them.
  const savedCountRef = useRef(knownEvents.length);
  // Saves run one at a time, in order, so an end-of-turn save never races the
  // per-event saves around it.
  const saveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  // The newest cursor of the chat's session this page has read, and the one saved.
  const sessionRef = useRef<ClientSessionState | undefined>(activeChat?.session);
  const savedCursorRef = useRef<ClientSessionState | undefined>(activeChat?.session);
  const lastHookEventRef = useRef<MessageStreamEvent | null>(null);
  const hookTurnRef = useRef(false);
  // A new turn this page sent through eve's hook, which eve's cancel() can target.
  const ownTurnRef = useRef(false);
  const sessionEndedRef = useRef(sessionEnded);
  const currentTitleRef = useRef(activeChat?.title ?? "New chat");
  const isSetupReady = setupStatus.appReady;
  const storageMode = setupStatus.storageMode;
  const router = useRouter();

  const runSaved = useCallback(<T,>(work: () => Promise<T>) => {
    const run = saveQueueRef.current.then(work);
    saveQueueRef.current = run.catch(() => {});
    return run;
  }, []);

  const reportSaveError = useCallback(
    (fallback: string) => (error: unknown) => {
      // An expired sign-in asks to sign in again; the chat keeps what it shows.
      if (isSignInError(error)) requestSignIn();
      setClientError(readableChatError(error, fallback));
    },
    [requestSignIn],
  );

  const noteCursor = useCallback((cursor: ClientSessionState) => {
    sessionRef.current = laterCursor(sessionRef.current, cursor);
  }, []);

  /** Saves how far the session has been read, after the event it follows is saved. */
  const saveCursor = useCallback(
    (cursor: ClientSessionState) => {
      const chatId = activeChatIdRef.current;
      if (!viewer || !chatId) return;
      void runSaved(async () => {
        if (laterCursor(savedCursorRef.current, cursor) !== cursor) return;
        await saveClientChatSession(storageMode, { chatId, session: cursor });
        savedCursorRef.current = cursor;
      }).catch(reportSaveError("Failed to save session state."));
    },
    [reportSaveError, runSaved, storageMode, viewer],
  );

  /**
   * Shows an event once, whichever reader delivered it, and saves it (streamed
   * fragments wait for the end-of-turn save). Returns the event as shown, or
   * null for one the chat already has.
   */
  const ingestEvent = useCallback(
    (event: MessageStreamEvent, namespace: string | undefined) => {
      const displayEvent = namespaceStreamEvent(event, namespace);
      const seen = seenRef.current!;

      if (hasSeen(seen, displayEvent)) return null;

      markSeen(seen, displayEvent);
      if (displayEvent.type === "session.completed" || displayEvent.type === "session.failed") {
        sessionEndedRef.current = true;
        setSessionEnded(true);
      }
      const next = [...liveEventsRef.current, displayEvent];
      liveEventsRef.current = next;
      setLiveEvents(next);

      const chatId = activeChatIdRef.current;

      if (viewer && chatId && !isStreamFragment(displayEvent)) {
        void runSaved(async () => {
          await appendClientChatEvent(storageMode, {
            chatId,
            event: displayEvent,
            eventIndex: savedCountRef.current,
          });
          savedCountRef.current += 1;
        }).catch(reportSaveError("Failed to save stream progress."));
      }

      return displayEvent;
    },
    [reportSaveError, runSaved, storageMode, viewer],
  );

  /**
   * At a turn boundary, saves the turn with its streamed fragments joined and
   * the cursor just past it. Events after the boundary stay live.
   */
  const commitTurn = useCallback(
    (boundary: MessageStreamEvent, cursor: ClientSessionState | undefined) => {
      const chatId = activeChatIdRef.current;
      if (!viewer || !chatId) return;

      void runSaved(async () => {
        const end = liveEventsRef.current.indexOf(boundary);
        if (end < 0) return;
        const turn = liveEventsRef.current.slice(0, end + 1);
        const known = knownEventsRef.current;
        const events = [...known, ...compactStreamFragments(turn)];
        const session = cursor ?? sessionRef.current;

        await saveClientChatSnapshot(storageMode, {
          chatId,
          events,
          session,
          unchanged: known.length,
        });
        if (session) savedCursorRef.current = laterCursor(savedCursorRef.current, session);
        savedCountRef.current = events.length;
        knownEventsRef.current = events;
        const rest = liveEventsRef.current.slice(liveEventsRef.current.indexOf(boundary) + 1);
        liveEventsRef.current = rest;
        setKnownEvents(events);
        setLiveEvents(rest);
        touchChat({
          id: chatId,
          title: currentTitleRef.current,
          updatedAt: new Date().toISOString(),
        });
        onActiveChatUpdated?.({
          events,
          id: chatId,
          pendingUserMessage: null,
          session,
          title: currentTitleRef.current,
        });
        for (const event of turn) {
          const text =
            event.type === "message.received" && !event.data.kind && receivedUserText(event);
          if (text) onPendingUserMessageSettled?.(text);
        }
      }).catch(reportSaveError("Failed to save chat."));
    },
    [
      onActiveChatUpdated,
      onPendingUserMessageSettled,
      reportSaveError,
      runSaved,
      storageMode,
      touchChat,
      viewer,
    ],
  );

  const agent = useEveAgent({
    initialSession: activeChat?.session,
    onEvent(event) {
      // eve reports a new session (onSessionChange) before its first event.
      lastHookEventRef.current = ingestEvent(event, sessionRef.current?.sessionId);
    },
    onSessionChange(session) {
      const shown = lastHookEventRef.current;
      lastHookEventRef.current = null;
      if (!session) return;
      const previous = sessionRef.current;
      noteCursor(session);
      if (previous?.sessionId !== session.sessionId) {
        // A session this page just created: keep it, so a reload can resume it.
        setSessionId(session.sessionId);
        saveCursor(session);
      }
      if (!shown) return;
      if (!isStreamFragment(shown)) saveCursor(session);
      if (isChatTurnSettledEvent(shown)) commitTurn(shown, session);
    },
    onError() {
      // The hook stopped reading the session; this page reads it again.
      if (!hookTurnRef.current) setHookFollowing(false);
    },
  });

  const displayEvents = useMemo(() => knownEvents.concat(liveEvents), [knownEvents, liveEvents]);
  const displayData = useMessageData(knownEvents, liveEvents);
  const displayMessages = displayData.messages;
  const displayChatId = chatId ?? activeChatId ?? "new";
  const hasLocalPendingUserMessage = Boolean(localPendingUserMessage);
  const pendingAuthorizations = useMemo(
    () => getPendingAuthorizations(displayEvents),
    [displayEvents],
  );
  const isWaitingForAuthorization = pendingAuthorizations.length > 0;
  const hasOpenTurn = useMemo(() => hasOpenChatTurn(displayEvents), [displayEvents]);
  const followingSessionId =
    viewer && isSetupReady && sessionId && !sessionEnded && !hookFollowing ? sessionId : null;
  const isSyncing = followingSessionId !== null && caughtUpSessionId !== followingSessionId;
  const isBusy =
    hasLocalPendingUserMessage || (!isWaitingForAuthorization && (hookTurn || hasOpenTurn));
  const canSteer =
    !hasLocalPendingUserMessage && !isWaitingForAuthorization && (hookTurn || hasOpenTurn);
  const isTurnBlocked = isBusy;
  const pendingMessage = useMemo(
    () => (pendingUserMessage ? createPendingUserMessage(displayChatId, pendingUserMessage) : null),
    [displayChatId, pendingUserMessage],
  );
  const localPendingMessage = useMemo(
    () =>
      localPendingUserMessage
        ? createPendingUserMessage(
            displayChatId,
            localPendingUserMessage,
            "local-pending-user-message",
          )
        : null,
    [displayChatId, localPendingUserMessage],
  );
  const disabledReason = isWaitingForAuthorization
    ? getConnectionAuthorizationDisabledReason(pendingAuthorizations)
    : undefined;
  const visibleMessages = appendPendingUserMessages(displayMessages, [
    pendingMessage,
    localPendingMessage,
  ]);
  const isEmpty = visibleMessages.length === 0 && !isTurnBlocked && !isWaitingForAuthorization;
  const isChatRoute = Boolean(shellActiveChatId || chatId);
  // "Thinking…" shows while nothing else on screen is in progress: before the
  // reply starts, and between a finished step and the next.
  const showThinking =
    !isWaitingForAuthorization &&
    (Boolean(pendingMessage || localPendingMessage) || hasOpenTurn || isTurnBlocked) &&
    !isReplyInProgress(visibleMessages.at(-1));
  const thinkingPresence = useThinkingPresence(showThinking);
  const turnFailure = useMemo(() => lastTurnFailure(displayEvents), [displayEvents]);
  const rawError =
    clientError ?? (agent.error ? readableChatError(agent.error, "The reply failed.") : null);
  // A failed send reports the provider's raw text; show what to do about it instead.
  const displayError = rawError
    ? rawError === turnFailure?.raw
      ? turnFailure.text
      : describeTurnFailure({ message: rawError })
    : (turnFailure?.text ?? null);
  const toastError = displayError && dismissedError !== displayError ? displayError : null;

  const resetSession = useCallback(() => {
    agent.reset();
    sessionRef.current = undefined;
    setSessionId(undefined);
    setActiveChatId(null);
    activeChatIdRef.current = null;
    knownEventsRef.current = [];
    liveEventsRef.current = [];
    seenRef.current = createSeenEvents();
    savedCountRef.current = 0;
    setKnownEvents([]);
    setLiveEvents([]);
    setCurrentTitle("New chat");
    currentTitleRef.current = "New chat";
    clearLocalPendingUserMessage();
    setClientError(null);
  }, [agent, clearLocalPendingUserMessage]);

  /**
   * The chat's session can no longer take messages: the next one starts a new
   * session (the chat shows where), and the chat forgets the old one.
   */
  const startFreshSession = useCallback(async () => {
    const ended = sessionRef.current;
    agent.reset();
    sessionRef.current = undefined;
    savedCursorRef.current = undefined;
    sessionEndedRef.current = false;
    setSessionEnded(false);
    setSessionId(undefined);
    if (ended)
      await runSaved(() => forgetClientChatSession(storageMode, ended.sessionId)).catch(() => {});
  }, [agent, runSaved, storageMode]);

  const prepareSend = useCallback(
    async (firstMessage: string) => {
      const limit = await checkClientSendLimit(storageMode, { message: firstMessage });

      if (!limit.allowed) {
        setClientError(limit.message);
        return false;
      }

      if (!activeChatIdRef.current) {
        const created = await createClientChat(storageMode, {
          pendingUserMessage: firstMessage,
        });

        touchChat(created);
        setActiveChatId(created.id);
        setShellActiveChatId(created.id);
        activeChatIdRef.current = created.id;
        knownEventsRef.current = [];
        savedCountRef.current = 0;
        setCurrentTitle(created.title);
        currentTitleRef.current = created.title;
        router.replace(`/chat/${created.id}`, { scroll: false });
      }

      return true;
    },
    [router, setShellActiveChatId, storageMode, touchChat],
  );

  const sendMessage = useCallback(
    async (text: string, draftHandlers: DraftHandlers) => {
      const message = text.trim();

      if (!message) return;

      const steering = canSteer;

      // Never drop a message silently: it stays in the box with the reason.
      if (localPendingUserMessageRef.current || (isTurnBlocked && !steering)) {
        draftHandlers.restoreDraft(message);
        setClientError(
          localPendingUserMessageRef.current
            ? "Your last message is still on its way. Send this one once it arrives."
            : "Ægentica is still responding. Wait for the reply or stop it first.",
        );
        return;
      }

      const lengthError = getChatMessageLengthError(message);

      if (lengthError) {
        setClientError(lengthError);
        return;
      }

      if (isWaitingForAuthorization) {
        draftHandlers.restoreDraft(message);
        setClientError(disabledReason ?? "Connect the requested service before continuing.");
        return;
      }

      const showLocalPendingMessage = () => {
        setLocalPendingUserMessage(message);
        draftHandlers.clearDraft();
      };
      const restoreAfterFailedSend = (error?: unknown, fallback = "Failed to send message.") => {
        clearLocalPendingUserMessage();
        draftHandlers.restoreDraft(message);

        if (error === undefined) return;
        // The message stays in the box; after signing in again it can be sent.
        if (isSignInError(error)) requestSignIn(message);
        setClientError(
          readableChatError(error, fallback, "You're offline. Your message is still in the box."),
        );
      };
      let ready = false;

      setClientError(null);

      if (!isSetupReady) {
        setClientError("Finish setup before chatting.");
        return;
      }

      if (!viewer) {
        requestSignIn(message);
        return;
      }

      showLocalPendingMessage();
      if (!steering) {
        onPendingUserMessageSettled?.(message);
      }

      try {
        ready = await prepareSend(message);
      } catch (error) {
        restoreAfterFailedSend(error, "Failed to prepare chat.");
        return;
      }

      if (!ready) {
        const chatId = activeChatIdRef.current;

        if (chatId) {
          void clearClientChatPendingMessage(storageMode, chatId);
        }
        restoreAfterFailedSend();
        return;
      }

      const chatId = activeChatIdRef.current;

      if (!chatId) {
        restoreAfterFailedSend(new Error("Chat is still getting ready."));
        return;
      }

      if (!steering) {
        try {
          // After any end-of-turn save still in the queue, which clears the pending mark.
          const updated = await runSaved(() =>
            markClientChatPendingMessage(storageMode, { chatId, message }),
          );
          touchChat(updated);
          // A chat still called "New chat" is named after its first message.
          setCurrentTitle(updated.title);
        } catch (error) {
          restoreAfterFailedSend(error, "Failed to save pending message.");
          return;
        }
      }

      hookTurnRef.current = true;
      if (!steering) ownTurnRef.current = true;
      setHookTurn(true);
      // eve's hook reads the session from here on; this page's own reader stops.
      setHookFollowing(true);
      try {
        const turn = await composerTurn(chatId, message);
        const sendTurn = (policy: "steer" | undefined) =>
          agent.send(turn.message, {
            headers: turn.headers,
            clientContext: createConnectionClientContext(
              enabledConnections,
              setupStatus.connectionsAvailable,
              setupStatus.configuredConnections,
            ),
            turnPolicy: policy,
          });
        if (sessionEndedRef.current) await startFreshSession();
        try {
          await sendTurn(steering ? "steer" : undefined);
        } catch (error) {
          // The session ended without this page seeing it (its deadline, or a
          // reset from Activity): send the message into a new session once.
          if (!isEndedSessionError(error)) throw error;
          await startFreshSession();
          await sendTurn(undefined);
        }
        // Clearing local attachment previews must not turn an accepted send into a retry.
        await clearComposerFiles(chatId).catch(() => {});
      } catch (error) {
        if (isAbortError(error)) {
          // The page was left mid-reply (eve detaches the stream). The saved
          // chat and its session cursor take over: coming back resumes the turn.
          clearLocalPendingUserMessage();
          return;
        }

        setHookFollowing(false);
        if (!steering) {
          void runSaved(() => clearClientChatPendingMessage(storageMode, chatId)).catch(() => {});
        }
        restoreAfterFailedSend(error);
      } finally {
        hookTurnRef.current = false;
        if (!steering) ownTurnRef.current = false;
        setHookTurn(false);
      }
    },
    [
      agent,
      canSteer,
      clearLocalPendingUserMessage,
      disabledReason,
      enabledConnections,
      isSetupReady,
      isTurnBlocked,
      isWaitingForAuthorization,
      localPendingUserMessageRef,
      prepareSend,
      requestSignIn,
      runSaved,
      setLocalPendingUserMessage,
      setupStatus.configuredConnections,
      setupStatus.connectionsAvailable,
      startFreshSession,
      storageMode,
      onPendingUserMessageSettled,
      touchChat,
      viewer,
    ],
  );

  const handleInputResponses = useCallback(
    async (
      responses: readonly {
        readonly optionId?: string;
        readonly requestId: string;
        readonly text?: string;
      }[],
    ) => {
      // A second tap before the first answer is on its way is ignored: the
      // flag is set before anything is awaited.
      if (isTurnBlocked || hookTurnRef.current) {
        return false;
      }

      if (!viewer) {
        requestSignIn();
        return false;
      }

      if (!activeChatIdRef.current) {
        setClientError("Start a chat before responding.");
        return false;
      }

      hookTurnRef.current = true;
      setHookTurn(true);
      try {
        const limit = await checkClientSendLimit(storageMode);

        if (!limit.allowed) {
          setClientError(limit.message);
          return false;
        }

        setHookFollowing(true);
        const draft = await readComposerDraft(activeChatIdRef.current ?? "new");
        await agent.respond(responses, { headers: composerHeaders(draft) });
        return true;
      } catch (error) {
        setHookFollowing(false);
        // Leaving the page detaches the answer's stream; eve still has the answer.
        if (isAbortError(error)) return false;
        if (isSignInError(error)) requestSignIn();
        setClientError(readableChatError(error, "Failed to send response."));
        return false;
      } finally {
        hookTurnRef.current = false;
        setHookTurn(false);
      }
    },
    [agent, isTurnBlocked, requestSignIn, storageMode, viewer],
  );

  // One handler for every row, so a change of the chat's state does not
  // re-render every message; it calls the latest handleInputResponses.
  const inputResponderRef = useRef(handleInputResponses);
  useEffect(() => {
    inputResponderRef.current = handleInputResponses;
  }, [handleInputResponses]);
  const respondToInput = useCallback(
    (responses: readonly AgentInputResponse[]) => inputResponderRef.current(responses),
    [],
  );

  const handleSkipAuthorization = useCallback(
    async (authorization: PendingConnectionAuthorization) => {
      if (!viewer) {
        requestSignIn();
        return;
      }

      if (!activeChatIdRef.current) {
        setClientError("Start a chat before skipping authorization.");
        return;
      }

      const session = attachClientSession(sessionRef.current);

      if (!session) {
        setClientError("Session is not ready to skip authorization.");
        return;
      }

      setSkippingAuthorizationKey(authorization.key);
      setClientError(null);

      try {
        // Skip ends the turn that waits for the sign-in, through eve; the
        // session and everything said in it stay (eve then streams
        // turn.cancelled and session.waiting, and the chat takes messages).
        const prefix = `${session.state.sessionId}:`;
        const turnId = authorization.turnId.startsWith(prefix)
          ? authorization.turnId.slice(prefix.length)
          : authorization.turnId;
        await session.cancel(turnId.startsWith("continued_") ? undefined : { turnId });
        // The prompt shows as skipped at once, and in the saved chat.
        ingestEvent(createAuthorizationDeclinedEvent(authorization), undefined);
      } catch (error) {
        if (isSignInError(error)) requestSignIn();
        setClientError(readableChatError(error, "Failed to skip authorization."));
      } finally {
        setSkippingAuthorizationKey(null);
      }
    },
    [ingestEvent, requestSignIn, viewer],
  );

  useEffect(() => {
    const nextChatId = activeChat?.id ?? chatId ?? null;
    const nextTitle = activeChat?.title ?? "New chat";

    setActiveChatId(nextChatId);
    activeChatIdRef.current = nextChatId;
    setCurrentTitle(nextTitle);
    currentTitleRef.current = nextTitle;
  }, [activeChat?.id, activeChat?.title, chatId]);

  // A newer saved chat (loaded again when the page is shown, or saved by
  // another tab) replaces the older one here; events already shown are not
  // shown twice. Older data (a page shown again replays what it first rendered
  // with) never replaces newer history.
  useEffect(() => {
    if (!activeChat || activeChat.id !== activeChatIdRef.current) return;
    const events = activeChat.events;
    const session = activeChat.session;
    if (events === knownEventsRef.current || events.length <= knownEventsRef.current.length) return;

    void runSaved(async () => {
      if (events.length <= knownEventsRef.current.length) return;
      const seen = createSeenEvents(events);
      const rest = liveEventsRef.current.filter((event) => !hasSeen(seen, event));
      for (const event of rest) markSeen(seen, event);
      seenRef.current = seen;
      knownEventsRef.current = events;
      liveEventsRef.current = rest;
      savedCountRef.current = events.length;
      setKnownEvents(events);
      setLiveEvents(rest);
      if (session) {
        savedCursorRef.current = laterCursor(savedCursorRef.current, session);
        const current = sessionRef.current;
        if (current?.sessionId !== session.sessionId) {
          sessionRef.current = session;
          setSessionId(session.sessionId);
        } else noteCursor(session);
      }
    });
  }, [activeChat, noteCursor, runSaved]);

  // Hiding the page detaches eve's hook from the session; reading it again is this page's job.
  useEffect(() => () => setHookFollowing(false), []);

  const takeFollowedEvent = useEffectEvent((event: MessageStreamEvent, session: ClientSession) => {
    const shown = ingestEvent(event, session.state.sessionId);
    noteCursor(session.state);
    if (!shown) return null;
    if (!isStreamFragment(shown)) saveCursor(session.state);
    if (isChatTurnSettledEvent(shown)) commitTurn(shown, session.state);
    return shown;
  });

  // A message still pending when the page closed is done if eve received it.
  const settleReceivedPendingMessage = useEffectEvent((events: readonly MessageStreamEvent[]) => {
    const pending = (pendingUserMessage ?? activeChat?.pendingUserMessage)?.trim();
    if (!pending) return;
    const received = events.some(
      (event) =>
        event.type === "message.received" &&
        !event.data.kind &&
        receivedUserText(event) === pending,
    );
    if (received) onPendingUserMessageSettled?.(pending);
  });

  const reportFollowError = useEffectEvent((error: unknown) => {
    if (isSignInError(error)) requestSignIn();
    setClientError(readableChatError(error, "Could not load the latest messages."));
  });

  // While the chat is shown and has a session, read it from the saved cursor:
  // first to its current end (a turn that finished or started while the page
  // was closed, the pending message eve already received), then live, so
  // replies to background work and turns from another tab appear and are saved
  // as they arrive. eve's hook takes over once this page sends.
  useEffect(() => {
    if (!followingSessionId) return;
    const start = sessionRef.current;
    if (start?.sessionId !== followingSessionId) return;
    const session = attachClientSession(start)!;
    const controller = new AbortController();
    const { signal } = controller;

    void (async () => {
      try {
        const caughtUp: MessageStreamEvent[] = [];
        let ended = false;
        for await (const event of session.stream({ follow: false, signal })) {
          const shown = takeFollowedEvent(event, session);
          if (shown) caughtUp.push(shown);
          ended ||= event.type === "session.completed" || event.type === "session.failed";
        }
        if (signal.aborted) return;
        settleReceivedPendingMessage(caughtUp);
        setCaughtUpSessionId(followingSessionId);
        if (ended) return;

        let failures = 0;
        while (!signal.aborted) {
          try {
            for await (const event of session.stream({ signal })) {
              failures = 0;
              takeFollowedEvent(event, session);
              if (event.type === "session.completed" || event.type === "session.failed") return;
            }
          } catch (error) {
            if (signal.aborted || isAbortError(error)) return;
            if (++failures > 5) throw error;
          }
          await sleep(Math.min(1000 * 2 ** failures, 15_000), signal);
        }
      } catch (error) {
        if (signal.aborted || isAbortError(error)) return;
        setCaughtUpSessionId(followingSessionId);
        reportFollowError(error);
      }
    })();

    return () => {
      controller.abort();
      setCaughtUpSessionId(null);
    };
  }, [followingSessionId]);

  useEffect(() => {
    currentTitleRef.current = currentTitle;
  }, [currentTitle]);

  // The window, the history, the app switcher and the share sheet name the
  // chat, not only the app. Leaving the chat hands the title back unless the
  // next page has set its own.
  const hasChat = Boolean(activeChat);
  useEffect(() => {
    if (!hasChat) return;
    const title = `${currentTitle} · Ægentica`;
    const previous = document.title;
    document.title = title;
    return () => {
      if (document.title === title) document.title = previous;
    };
  }, [currentTitle, hasChat]);

  useEffect(() => {
    setDismissedError(null);
  }, [displayError]);

  useEffect(() => {
    if (localPendingUserMessage && hasLatestUserMessage(displayMessages, localPendingUserMessage)) {
      clearLocalPendingUserMessage();
    }
  }, [clearLocalPendingUserMessage, displayMessages, localPendingUserMessage]);

  useEffect(() => {
    onControllerChange(
      {
        reset: resetSession,
        sendMessage,
        stop: () => {
          // eve's hook cancels a turn it started once the turn has begun. Any
          // other reply (resumed after a reload, corrected, answered, or
          // started elsewhere) is cancelled through its session.
          const session = attachClientSession(sessionRef.current);
          const request = ownTurnRef.current || !session ? agent.cancel() : session.cancel();
          // A failed stop leaves the reply running; say so instead of failing quietly.
          request.catch((error: unknown) => {
            if (isAbortError(error)) return;
            const detail = error instanceof Error && error.message ? ` (${error.message})` : "";
            setClientError(
              `Could not stop the reply${detail}. Check the connection and try again.`,
            );
          });
        },
      },
      {
        canSteer,
        disabledReason,
        isBusy,
        isDisabled: !isSetupReady || isWaitingForAuthorization,
        isEmpty,
        isSyncing,
      },
    );
  }, [
    agent.cancel,
    canSteer,
    disabledReason,
    isBusy,
    isEmpty,
    isSetupReady,
    isSyncing,
    isWaitingForAuthorization,
    onControllerChange,
    resetSession,
    sendMessage,
  ]);

  useEffect(() => {
    return () => {
      onControllerChange(null, IDLE_CONTROLLER_STATUS);
    };
  }, [onControllerChange]);

  const isReplyStreaming = hookTurn || hasOpenTurn;
  let previousSession: string | undefined;

  return (
    <>
      {toastError ? (
        <ErrorToast message={toastError} onDismiss={() => setDismissedError(toastError)} />
      ) : null}

      {isEmpty && !activeChatId && !isChatRoute && emptyComposer ? (
        <EmptyChatBody composer={emptyComposer} />
      ) : (
        <>
          {isChatRoute ? <SessionHeader /> : null}
          {isEmpty ? (
            <BlankChatBody />
          ) : (
            <ChatConversation>
              {/* Replies wrap long words; only code blocks and tables scroll sideways,
                  so a swipe on the conversation still opens the phone drawer. */}
              <ChatConversationContent scrollClassName="overflow-x-hidden">
                {visibleMessages.map((message, index) => {
                  const messageSession = messageSessionId(message);
                  const startedOver =
                    messageSession !== undefined &&
                    previousSession !== undefined &&
                    messageSession !== previousSession;
                  previousSession = messageSession ?? previousSession;
                  return (
                    <Fragment key={message.id}>
                      {startedOver ? <SessionRestartNote /> : null}
                      <ChatMessage
                        canRespond={
                          // eve keeps a prompt pending until the server settles the answer,
                          // so its controls stay disabled while a response is in flight.
                          !isTurnBlocked &&
                          !isWaitingForAuthorization &&
                          Boolean(viewer) &&
                          isSetupReady
                        }
                        isStreaming={isReplyStreaming && index === visibleMessages.length - 1}
                        message={message}
                        onInputResponses={respondToInput}
                      />
                    </Fragment>
                  );
                })}
                {pendingAuthorizations.map((authorization) => (
                  <ConnectionAuthorizationPrompt
                    authorization={authorization}
                    isSkipping={skippingAuthorizationKey === authorization.key}
                    key={authorization.key}
                    onSkip={handleSkipAuthorization}
                  />
                ))}
                {thinkingPresence.shouldRender ? (
                  <ThinkingLine isVisible={thinkingPresence.isVisible} />
                ) : null}
              </ChatConversationContent>
              <ChatScrollButton />
            </ChatConversation>
          )}
        </>
      )}
    </>
  );
}

type PendingConnectionAuthorization = {
  readonly description: string;
  readonly displayName: string;
  readonly expiresAt?: string;
  readonly instructions?: string;
  readonly key: string;
  readonly name: string;
  readonly sequence: number;
  readonly stepIndex: number;
  readonly turnId: string;
  readonly url?: string;
  readonly authorization?: AuthorizationRequiredStreamEvent["data"]["authorization"];
};

function getPendingAuthorizations(events: readonly MessageStreamEvent[]) {
  const pending = new Map<string, PendingConnectionAuthorization>();

  for (const event of events) {
    if (event.type === "authorization.required") {
      const authorization = toPendingAuthorization(event);
      pending.set(authorization.name, authorization);
      continue;
    }

    if (event.type === "authorization.completed") {
      pending.delete(event.data.name);
      continue;
    }

    if (event.type === "turn.cancelled" || event.type === "turn.failed") {
      for (const [name, authorization] of pending)
        if (authorization.turnId === event.data.turnId) pending.delete(name);
    }
  }

  return [...pending.values()];
}

function getConnectionAuthorizationDisabledReason(
  authorizations: readonly PendingConnectionAuthorization[],
) {
  const displayName = authorizations[0]?.displayName ?? "the requested service";

  return `Connect ${displayName} to continue this turn, or skip it.`;
}

function toPendingAuthorization(
  event: AuthorizationRequiredStreamEvent,
): PendingConnectionAuthorization {
  const challenge = event.data.authorization;
  const displayName = challenge?.displayName ?? event.data.name;

  return {
    authorization: challenge,
    description:
      challenge?.instructions ??
      event.data.description ??
      `Connect ${displayName} to let Ægentica continue.`,
    displayName,
    expiresAt: challenge?.expiresAt,
    instructions: challenge?.instructions,
    key: `${event.data.turnId}:${event.data.name}`,
    name: event.data.name,
    sequence: event.data.sequence,
    stepIndex: event.data.stepIndex,
    turnId: event.data.turnId,
    url: challenge?.url,
  };
}

// Finger-sized under a finger, dense beside a mouse.
const CONNECTION_ACTION = "h-11 pointer-fine:md:h-6";

function ConnectionAuthorizationPrompt({
  authorization,
  isSkipping,
  onSkip,
}: {
  readonly authorization: PendingConnectionAuthorization;
  readonly isSkipping: boolean;
  readonly onSkip: (authorization: PendingConnectionAuthorization) => Promise<void>;
}) {
  return (
    <article aria-live="polite" className="flex w-full justify-start px-3">
      <div className="w-full max-w-md rounded-lg border border-border/70 bg-muted/20 p-3 text-sm shadow-sm">
        <div className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            <PlugIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Connect {authorization.displayName}</p>
            <p className="mt-1 text-muted-foreground">{authorization.description}</p>
            <div className="mt-2.5 flex items-center gap-2">
              {authorization.url ? (
                <Button asChild className={CONNECTION_ACTION} size="xs" type="button">
                  <a href={authorization.url} rel="noreferrer" target="_blank">
                    Connect
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </Button>
              ) : null}
              <Button
                className={CONNECTION_ACTION}
                disabled={isSkipping}
                onClick={() => {
                  void onSkip(authorization);
                }}
                size="xs"
                type="button"
                variant="outline"
              >
                {isSkipping ? "Skipping..." : "Skip"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/** A skipped sign-in, recorded like eve records a declined one. */
function createAuthorizationDeclinedEvent(
  authorization: PendingConnectionAuthorization,
): MessageStreamEvent {
  return {
    data: {
      authorization: authorization.authorization,
      name: authorization.name,
      outcome: "declined",
      reason: "skipped",
      sequence: authorization.sequence,
      stepIndex: authorization.stepIndex,
      turnId: authorization.turnId,
    },
    meta: {
      at: new Date().toISOString(),
      id: `local_${crypto.randomUUID()}`,
    },
    type: "authorization.completed",
  };
}

function appendPendingUserMessages(
  messages: readonly EveMessageData["messages"][number][],
  pendingMessages: readonly (EveMessage | null)[],
) {
  let nextMessages = messages;

  for (const pendingMessage of pendingMessages) {
    const pendingText = pendingMessage ? getMessageText(pendingMessage) : null;

    if (!pendingMessage || !pendingText || hasLatestUserMessage(nextMessages, pendingText)) {
      continue;
    }

    nextMessages = [...nextMessages, pendingMessage];
  }

  return nextMessages;
}

function createPendingUserMessage(
  chatId: string,
  text: string,
  idSuffix = "pending-user-message",
): EveMessage {
  return {
    id: `${chatId}:${idSuffix}`,
    metadata: {
      optimistic: true,
      status: "submitted",
    },
    parts: [
      {
        state: "done",
        text,
        type: "text",
      },
    ],
    role: "user",
  };
}

function usePendingUserMessage() {
  const [message, setMessageState] = useState<string | null>(null);
  const messageRef = useRef<string | null>(null);

  const setMessage = useCallback((nextMessage: string | null) => {
    messageRef.current = nextMessage;
    setMessageState(nextMessage);
  }, []);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, [setMessage]);

  return { clearMessage, message, messageRef, setMessage };
}

const CONNECTION_LABELS = {
  linear: "Linear",
  notion: "Notion",
  sentry: "Sentry",
} satisfies Record<keyof EnabledConnections, string>;

function createConnectionClientContext(
  enabledConnections: EnabledConnections,
  connectionsAvailable: boolean,
  configuredConnections: SetupStatus["configuredConnections"],
) {
  if (!connectionsAvailable) {
    return "No external connections are configured. Do not search or call connection tools.";
  }

  const configured = new Set(configuredConnections ?? []);
  const entries = (
    Object.entries(CONNECTION_LABELS) as [keyof EnabledConnections, string][]
  ).filter(([connection]) => configured.has(connection));
  const enabled = entries
    .filter(([connection]) => enabledConnections[connection])
    .map(([, label]) => label);
  const disabled = entries
    .filter(([connection]) => !enabledConnections[connection])
    .map(([, label]) => label);

  if (enabled.length > 0) {
    const disabledContext =
      disabled.length > 0
        ? ` Do not use disabled configured connections unless the user enables them first: ${disabled.join(", ")}.`
        : "";

    return `The user has enabled these external connections for this turn: ${enabled.join(", ")}. Use an enabled connection when it is relevant to the user's request.${disabledContext}`;
  }

  return "The user has disabled all external connections for this turn. Do not search or call connection tools unless the user enables a connection first.";
}

function useThinkingPresence(active: boolean) {
  const [shouldRender, setShouldRender] = useState(active);
  const [isVisible, setIsVisible] = useState(active);

  useEffect(() => {
    if (active) {
      setShouldRender(true);

      const frame = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    setIsVisible(false);

    const timeout = window.setTimeout(() => {
      setShouldRender(false);
    }, THINKING_EXIT_DURATION_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [active]);

  return { isVisible, shouldRender };
}

/** Where a chat continued in a new eve session, whose context starts empty. */
function SessionRestartNote() {
  return (
    <div className="flex items-center gap-3 px-3 text-xs text-muted-foreground" role="note">
      <span aria-hidden className="h-px flex-1 bg-border" />
      <span className="max-w-[80%] text-center">
        Ægentica started over here and doesn&apos;t remember the messages above.
      </span>
      <span aria-hidden className="h-px flex-1 bg-border" />
    </div>
  );
}

function SessionHeader() {
  return <div className="h-12 shrink-0" />;
}

function BlankChatBody() {
  return <div className="min-h-0 flex-1" />;
}

export function EmptyChatBody({ composer }: { readonly composer?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-14 md:pt-8">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="w-full max-w-2xl space-y-8 sm:space-y-10 md:space-y-12">
          <h1 className="flex justify-center">
            <img
              alt="Ægentica"
              className="size-16 select-none invert sm:size-20 md:size-24 dark:invert-0"
              draggable={false}
              src="/aegentica.svg"
            />
          </h1>
          {composer}
        </div>
      </div>
    </div>
  );
}

function hasLatestUserMessage(
  messages: readonly EveMessageData["messages"][number][],
  text: string,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role !== "user") {
      continue;
    }

    return getMessageText(message) === text.trim();
  }

  return false;
}

function getMessageText(message: EveMessageData["messages"][number]) {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  return text || null;
}
