"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  AgentChatSession,
  type AgentChatController,
  type AgentChatControllerStatus,
} from "@/app/_components/agent-chat";
import { ComposerFooterControls } from "@/components/chat/composer-footer-controls";
import { ErrorToast } from "@/components/chat/error-toast";
import { START_CHAT_ERROR_KEY, START_CHAT_SIGN_IN_KEY } from "@/app/_components/home-chat-page";
import {
  CHAT_ROUTE_SYNC_EVENT,
  type ChatRouteSyncDetail,
} from "@/app/_components/agent-chat-events";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { ChatComposer } from "@/components/chat/composer";
import { ComposerDock } from "@/components/chat/pending-turn";
import {
  clearPendingChatMessage,
  isProvisionalChatId,
  readPendingChatMessage,
  writePendingChatMessage,
} from "@/lib/chat/provisional-chat";
import { createClientChat, getClientChat } from "@/lib/chat/persistence-client";
import type { ActiveChat, SetupStatus } from "@/lib/chat/types";
import { moveComposerDraft } from "@/lib/chat/composer-draft";
import { readDraftText, saveDraftText } from "@/lib/chat/draft-text";
import { receivedUserText } from "@/lib/chat/event-log";
import { isSignInError, readableChatError } from "@/lib/chat/errors";

const subscribeNever = () => () => {};
const IDLE_CONTROLLER_STATUS: AgentChatControllerStatus = {
  canSteer: false,
  isBusy: false,
  isDisabled: false,
  isEmpty: true,
  isSyncing: false,
};

export function SessionChatPage({
  chatId,
  children,
}: {
  readonly chatId: string;
  readonly children: ReactNode;
}) {
  const { requestSignIn, setActiveChatId, setupStatus, touchChat, viewer } = useChatShell();
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [draft, setDraft] = useState("");
  const [controllerReady, setControllerReady] = useState(false);
  const [controllerStatus, setControllerStatus] = useState(IDLE_CONTROLLER_STATUS);
  // The message that opened this chat is on screen from the first frame (the
  // home page hands it over in session storage); a hard load hydrates with
  // nothing and reads it in the effect below.
  const initialPendingMessage = useSyncExternalStore(
    subscribeNever,
    () => readPendingChatMessage(chatId),
    () => null,
  );
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(
    initialPendingMessage,
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const controllerRef = useRef<AgentChatController | null>(null);
  // The status the current chat instance reported last. While a loaded chat
  // replaces the loading placeholder, the rendered status is still the
  // placeholder's, so the send below must not trust it.
  const controllerStatusRef = useRef(IDLE_CONTROLLER_STATUS);
  const activeChatRef = useRef<ActiveChat | null>(null);
  const currentChatIdRef = useRef(chatId);
  const pendingConsumedRef = useRef(false);
  const provisionalCreateStartedRef = useRef(new Set<string>());
  const settledPendingMessagesRef = useRef(new Set<string>());
  const isProvisionalChat = isProvisionalChatId(chatId);
  const router = useRouter();
  const toastError = clientError && dismissedError !== clientError ? clientError : null;
  const isLoadingChat = !activeChat;

  useEffect(() => {
    currentChatIdRef.current = chatId;
  }, [chatId]);

  // No reset effect on chatId: the page is keyed by chat id, so it starts fresh
  // for each chat. Next keeps a left page alive and re-runs its effects when
  // Back shows it again; a reset there forgot which message was already sent
  // and sent it a second time.

  useEffect(() => {
    const restoredPendingMessage = readPendingChatMessage(chatId);

    if (restoredPendingMessage) {
      setPendingUserMessage((current) => current ?? restoredPendingMessage);
      setClientError(null);
    }
  }, [chatId]);

  useEffect(() => {
    if (!isProvisionalChat || !viewer || !setupStatus.appReady) {
      return;
    }

    const pendingMessage = readPendingChatMessage(chatId);

    if (!pendingMessage) {
      setClientError("Message could not be restored. Start a new chat.");
      return;
    }

    setPendingUserMessage((current) => current ?? pendingMessage);

    if (provisionalCreateStartedRef.current.has(chatId)) {
      return;
    }

    provisionalCreateStartedRef.current.add(chatId);
    setClientError(null);

    void (async () => {
      try {
        const created = await createClientChat(setupStatus.storageMode, {
          pendingUserMessage: pendingMessage,
        });

        if (currentChatIdRef.current !== chatId) {
          return;
        }

        await moveComposerDraft(chatId, created.id);
        writePendingChatMessage(created.id, pendingMessage);
        clearPendingChatMessage(chatId);
        touchChat(created);
        setActiveChatId(created.id);
        router.replace(`/chat/${created.id}`, { scroll: false });
      } catch (error) {
        if (currentChatIdRef.current !== chatId) {
          return;
        }

        clearPendingChatMessage(chatId);
        setPendingUserMessage(null);
        const reason = readableChatError(
          error,
          "Failed to start chat.",
          "You're offline. Your message is still in the box.",
        );
        // This page is hidden once it leaves, so the home page shows why (and,
        // for an expired sign-in, asks to sign in again with the message kept).
        try {
          window.sessionStorage.setItem("eve-chat-draft", pendingMessage);
          window.sessionStorage.setItem(START_CHAT_ERROR_KEY, reason);
          if (isSignInError(error)) window.sessionStorage.setItem(START_CHAT_SIGN_IN_KEY, "1");
        } catch {}

        setClientError(reason);
        router.replace("/", { scroll: false });
      }
    })();
  }, [
    chatId,
    isProvisionalChat,
    router,
    setActiveChatId,
    setupStatus.appReady,
    setupStatus.storageMode,
    touchChat,
    viewer,
  ]);

  useEffect(() => {
    setActiveChatId(chatId);

    return () => {
      setActiveChatId(null);
    };
  }, [chatId, setActiveChatId]);

  useEffect(() => {
    activeChatRef.current = activeChat;
  }, [activeChat]);

  useEffect(() => {
    const applyRouteSync = (detail: ChatRouteSyncDetail) => {
      // The chat page's server data only confirms the chat exists; the chat
      // itself is loaded below. A route without a chat must never clear one.
      if (detail.chatId !== chatId || !detail.activeChat) {
        return;
      }
      // The route data is what the server rendered when the page was first
      // opened; a page shown again by Back replays it. It fills an empty page
      // but never replaces a newer chat or brings back a sent message.
      const current = activeChatRef.current;
      if (current?.id === chatId) {
        if (detail.activeChat && detail.activeChat.events.length >= current.events.length)
          setActiveChat(detail.activeChat);
        return;
      }

      setActiveChat(detail.activeChat);
      setPendingUserMessage(
        getRestorablePendingUserMessage(
          detail.activeChat.pendingUserMessage,
          settledPendingMessagesRef.current,
          detail.activeChat.events,
        ),
      );
    };
    const target = window as Window & {
      __eveChatRouteSync?: ChatRouteSyncDetail;
    };
    const handleRouteSync = (event: Event) => {
      applyRouteSync((event as CustomEvent<ChatRouteSyncDetail>).detail);
    };

    window.addEventListener(CHAT_ROUTE_SYNC_EVENT, handleRouteSync);
    if (target.__eveChatRouteSync) {
      applyRouteSync(target.__eveChatRouteSync);
    }

    return () => {
      window.removeEventListener(CHAT_ROUTE_SYNC_EVENT, handleRouteSync);
    };
  }, [chatId]);

  useEffect(() => {
    if (!viewer || !setupStatus.appReady || isProvisionalChat) {
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const chat = await getClientChat(setupStatus.storageMode, chatId);

        if (cancelled) {
          return;
        }

        if (!chat) {
          setClientError("Chat not found.");
          return;
        }

        setActiveChat(chat);
        const nextPendingUserMessage = getRestorablePendingUserMessage(
          chat.pendingUserMessage,
          settledPendingMessagesRef.current,
          chat.events,
        );

        setPendingUserMessage(nextPendingUserMessage);

        if (!nextPendingUserMessage) {
          clearPendingChatMessage(chatId);
        }
        setClientError(null);
      } catch (error) {
        if (!cancelled && !abortController.signal.aborted) {
          if (isSignInError(error)) requestSignIn();
          setClientError(readableChatError(error, "Failed to load chat history."));
        }
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [
    chatId,
    isProvisionalChat,
    requestSignIn,
    setupStatus.appReady,
    setupStatus.storageMode,
    viewer,
  ]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const restoredDraft = window.sessionStorage.getItem("eve-chat-draft");

    if (restoredDraft) {
      setDraft(restoredDraft);
      window.sessionStorage.removeItem("eve-chat-draft");
    } else if (!isProvisionalChat) {
      const saved = readDraftText(chatId);
      if (saved) setDraft(saved);
    }
  }, [chatId, isProvisionalChat, viewer]);

  // A chat that is still being created has no lasting id to keep a draft under.
  useEffect(() => {
    if (viewer && !isProvisionalChat) saveDraftText(chatId, draft);
  }, [chatId, draft, isProvisionalChat, viewer]);

  useEffect(() => {
    // A restored pending message waits until the chat has read its session:
    // if eve already received it, that turn resumes instead of a second send.
    const status = controllerStatusRef.current;
    if (
      pendingConsumedRef.current ||
      isLoadingChat ||
      !controllerReady ||
      status.isSyncing ||
      status.isBusy ||
      status.isDisabled
    ) {
      return;
    }

    if (!pendingUserMessage) {
      return;
    }

    const controller = controllerRef.current;

    if (!controller) {
      return;
    }

    pendingConsumedRef.current = true;

    void controller.sendMessage(pendingUserMessage, {
      clearDraft: () => setDraft(""),
      restoreDraft: (value) => {
        setPendingUserMessage(null);
        setDraft(value);
      },
    });
  }, [
    chatId,
    controllerReady,
    controllerStatus.isBusy,
    controllerStatus.isDisabled,
    controllerStatus.isSyncing,
    isLoadingChat,
    pendingUserMessage,
  ]);

  useEffect(() => {
    setDismissedError(null);
  }, [clientError]);

  const handleControllerChange = useCallback(
    (controller: AgentChatController | null, status: AgentChatControllerStatus) => {
      controllerRef.current = controller;
      controllerStatusRef.current = status;
      setControllerReady(Boolean(controller));
      setControllerStatus((current) => (sameControllerStatus(current, status) ? current : status));
    },
    [],
  );

  const handleComposerSubmit = useCallback(
    async (text: string) => {
      if (isLoadingChat) {
        setClientError("Chat history is still loading.");
        return;
      }

      const controller = controllerRef.current;

      if (!controller) {
        setClientError("Chat is still getting ready.");
        return;
      }

      await controller.sendMessage(text, {
        clearDraft: () => setDraft(""),
        restoreDraft: setDraft,
      });
    },
    [isLoadingChat],
  );

  const handleComposerStop = useCallback(() => {
    controllerRef.current?.stop();
  }, []);

  const handlePendingUserMessageSettled = useCallback(
    (message?: string) => {
      clearPendingChatMessage(chatId);

      if (message) {
        settledPendingMessagesRef.current.add(message);
      }

      setPendingUserMessage((current) => (!message || current === message ? null : current));
    },
    [chatId],
  );

  // A saved turn settles only its own messages (handlePendingUserMessageSettled):
  // saving another turn (a task result) must not drop a message still to send.
  const handleActiveChatUpdated = useCallback((nextActiveChat: ActiveChat) => {
    setActiveChat(nextActiveChat);
  }, []);

  const composerDisabled =
    !setupStatus.appReady ||
    isLoadingChat ||
    Boolean(pendingUserMessage) ||
    controllerStatus.isDisabled;
  const sessionInstanceKey = activeChat ? `${chatId}:loaded` : `${chatId}:loading`;
  const composerDisabledReason = getSessionComposerDisabledReason({
    controllerStatus,
    isLoadingChat,
    pendingUserMessage,
    setupStatus,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toastError ? (
        <ErrorToast message={toastError} onDismiss={() => setDismissedError(toastError)} />
      ) : null}

      <AgentChatSession
        activeChat={activeChat}
        chatId={chatId}
        key={sessionInstanceKey}
        onActiveChatUpdated={handleActiveChatUpdated}
        onPendingUserMessageSettled={handlePendingUserMessageSettled}
        onControllerChange={handleControllerChange}
        pendingUserMessage={pendingUserMessage}
      />

      <ComposerDock>
        <ChatComposer
          allowSteering={controllerStatus.canSteer}
          disabled={composerDisabled}
          disabledReason={composerDisabledReason}
          footerStart={<ComposerFooterControls setupStatus={setupStatus} />}
          isBusy={controllerStatus.isBusy}
          onChange={setDraft}
          onStop={handleComposerStop}
          onSubmit={handleComposerSubmit}
          placeholder="Message Ægentica"
          value={draft}
        />
      </ComposerDock>

      <div className="hidden" aria-hidden>
        {children}
      </div>
    </div>
  );
}

function sameControllerStatus(left: AgentChatControllerStatus, right: AgentChatControllerStatus) {
  return (
    left.canSteer === right.canSteer &&
    left.disabledReason === right.disabledReason &&
    left.isBusy === right.isBusy &&
    left.isDisabled === right.isDisabled &&
    left.isEmpty === right.isEmpty &&
    left.isSyncing === right.isSyncing
  );
}

function getRestorablePendingUserMessage(
  pendingUserMessage: string | null | undefined,
  settledMessages: ReadonlySet<string>,
  savedEvents: ActiveChat["events"] = [],
) {
  if (
    !pendingUserMessage ||
    settledMessages.has(pendingUserMessage) ||
    latestReceivedMessage(savedEvents) === pendingUserMessage.trim()
  ) {
    return null;
  }

  return pendingUserMessage;
}

// The server clears a pending message only with the end-of-turn save, so a
// reload just before it still finds one. If eve already received it, the chat
// resumes that turn instead of sending the message a second time.
function latestReceivedMessage(events: ActiveChat["events"]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.type === "message.received") return receivedUserText(event);
  }
  return null;
}

function getSessionComposerDisabledReason({
  controllerStatus,
  isLoadingChat,
  pendingUserMessage,
  setupStatus,
}: {
  readonly controllerStatus: AgentChatControllerStatus;
  readonly isLoadingChat: boolean;
  readonly pendingUserMessage: string | null;
  readonly setupStatus: SetupStatus;
}) {
  if (controllerStatus.disabledReason) {
    return controllerStatus.disabledReason;
  }

  if (pendingUserMessage) {
    return "Sending message.";
  }

  if (isLoadingChat) {
    return "Chat history is still loading.";
  }

  if (!setupStatus.authReady) {
    const missing = setupStatus.missing.length
      ? ` Missing: ${setupStatus.missing.join(", ")}.`
      : "";

    return `Finish auth setup before chatting.${missing}`;
  }

  if (controllerStatus.isDisabled) {
    return "Chat is unavailable.";
  }

  if (controllerStatus.isBusy) {
    return "Ægentica is responding.";
  }

  return undefined;
}
