"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { type AgentChatControllerStatus } from "@/app/_components/agent-chat";
import { ComposerFooterControls } from "@/components/chat/composer-footer-controls";
import { ErrorToast } from "@/components/chat/error-toast";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { ChatComposer } from "@/components/chat/composer";
import {
  ComposerDock,
  ConversationFrame,
  ThinkingLine,
  UserBubble,
} from "@/components/chat/pending-turn";
import { getChatMessageLengthError } from "@/lib/chat/limits";
import { createProvisionalChatId, writePendingChatMessage } from "@/lib/chat/provisional-chat";
import type { SetupStatus } from "@/lib/chat/types";
import { moveComposerDraft } from "@/lib/chat/composer-draft";
import { readDraftText, saveDraftText } from "@/lib/chat/draft-text";
import { cn } from "@/lib/utils";

const IDLE_CONTROLLER_STATUS: AgentChatControllerStatus = {
  canSteer: false,
  isBusy: false,
  isDisabled: false,
  isEmpty: true,
  isSyncing: false,
};

/** How long the home page takes to become the chat page (the composer's glide). */
const LEAVE_MS = 340;
const LEAVE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";

/**
 * A chat that could not be created sends the message back here (as the
 * eve-chat-draft) with the reason under this key, shown once in the error toast.
 */
export const START_CHAT_ERROR_KEY = "aegentica-start-chat-error";
/** Set with the error when the chat could not be created because the sign-in expired. */
export const START_CHAT_SIGN_IN_KEY = "aegentica-start-chat-sign-in";

export function HomeChatPage() {
  const { requestSignIn, setActiveChatId, setupStatus, viewer } = useChatShell();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // The message on its way to a new chat: the page already looks like that
  // chat while the route loads, so nothing flashes or jumps.
  const [leaving, setLeaving] = useState<{ message: string; from: DOMRect } | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const composerRef = useRef<HTMLDivElement>(null);
  const setupReady = setupStatus.appReady;
  const pathname = usePathname();
  const router = useRouter();
  const toastError = clientError && dismissedError !== clientError ? clientError : null;

  useEffect(() => {
    setActiveChatId(null);
  }, [setActiveChatId]);

  useEffect(() => {
    if (pathname === "/") {
      submittingRef.current = false;
      setSubmitting(false);
      setLeaving(null);
      let startError: string | null = null;
      let signIn = false;
      let draft = "";
      try {
        startError = window.sessionStorage.getItem(START_CHAT_ERROR_KEY);
        signIn = window.sessionStorage.getItem(START_CHAT_SIGN_IN_KEY) === "1";
        draft = window.sessionStorage.getItem("eve-chat-draft") ?? "";
        window.sessionStorage.removeItem(START_CHAT_ERROR_KEY);
        window.sessionStorage.removeItem(START_CHAT_SIGN_IN_KEY);
      } catch {}
      if (startError) setClientError(startError);
      if (signIn) requestSignIn(draft);
    }
  }, [pathname, requestSignIn]);

  useEffect(() => {
    // The manifest's share target opens /?title=&text=&url=; keep it as a draft until sign-in.
    const shared = new URLSearchParams(window.location.search);
    const sharedText = ["title", "text", "url"]
      .map((key) => shared.get(key)?.trim())
      .filter(
        (value, index, values): value is string =>
          Boolean(value) && values.indexOf(value) === index,
      )
      .join("\n\n");
    if (sharedText) {
      window.sessionStorage.setItem("eve-chat-draft", sharedText);
      window.history.replaceState(null, "", "/");
    }

    if (!viewer) {
      return;
    }

    const restoredDraft = window.sessionStorage.getItem("eve-chat-draft");

    if (restoredDraft) {
      setDraft(restoredDraft);
      window.sessionStorage.removeItem("eve-chat-draft");
    } else {
      const saved = readDraftText("new");
      if (saved) setDraft(saved);
    }
  }, [viewer]);

  useEffect(() => {
    if (viewer) saveDraftText("new", draft);
  }, [draft, viewer]);

  useEffect(() => {
    setDismissedError(null);
  }, [clientError]);

  // The composer glides from where it was to the bottom of the page (a FLIP
  // move: the new layout is applied, then played from the old position), the
  // greeting fades and the sent message settles above.
  useLayoutEffect(() => {
    const composer = composerRef.current;
    if (!leaving || !composer) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const to = composer.getBoundingClientRect();
    const dy = leaving.from.top - to.top;
    if (Math.abs(dy) < 1) return;
    const animation = composer.animate(
      [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
      { duration: LEAVE_MS, easing: LEAVE_EASING, fill: "both" },
    );
    return () => animation.cancel();
  }, [leaving]);

  const handleSubmit = useCallback(
    async (text: string) => {
      const message = text.trim();

      if (!message || submittingRef.current) {
        return;
      }

      setClientError(null);

      const lengthError = getChatMessageLengthError(message);

      if (lengthError) {
        setClientError(lengthError);
        return;
      }

      if (!setupReady) {
        setClientError(
          getHomeComposerDisabledReason({ setupStatus, submitting }) ??
            "Finish setup before chatting.",
        );
        return;
      }

      if (!viewer) {
        requestSignIn(message);
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);
      setDraft("");

      const provisionalChatId = createProvisionalChatId();
      try {
        await moveComposerDraft("new", provisionalChatId);
      } catch (error) {
        submittingRef.current = false;
        setSubmitting(false);
        setDraft(message);
        setClientError(error instanceof Error ? error.message : "Could not preserve your draft.");
        return;
      }
      const didStoreMessage = writePendingChatMessage(provisionalChatId, message);

      if (!didStoreMessage) {
        await moveComposerDraft(provisionalChatId, "new").catch(() => {});
        submittingRef.current = false;
        setSubmitting(false);
        setDraft(message);
        setClientError("Failed to start chat.");
        return;
      }

      const href = `/chat/${provisionalChatId}`;
      const from = composerRef.current?.getBoundingClientRect();
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      setActiveChatId(provisionalChatId);
      if (!from || reduced) {
        router.push(href, { scroll: false });
        return;
      }
      // The chat route loads while the page turns into it, so the switch at
      // the end of the move is between two identical frames.
      // "full" fetches a dynamic route's whole payload; Next exports the enum only internally.
      router.prefetch(href, { kind: "full" } as Parameters<typeof router.prefetch>[1]);
      setLeaving({ message, from });
      window.setTimeout(() => router.push(href, { scroll: false }), LEAVE_MS);
    },
    [requestSignIn, router, setActiveChatId, setupReady, setupStatus, submitting, viewer],
  );

  const composerDisabled = !setupReady || Boolean(leaving);
  const composerDisabledReason = leaving
    ? undefined
    : getHomeComposerDisabledReason({
        setupStatus,
        submitting,
      });

  if (pathname !== "/") {
    return null;
  }

  const composer = (
    <ChatComposer
      autoFocus
      disabled={composerDisabled}
      disabledReason={composerDisabledReason}
      footerStart={<ComposerFooterControls setupStatus={setupStatus} />}
      isBusy={IDLE_CONTROLLER_STATUS.isBusy}
      isPreparing={submitting && !leaving}
      onChange={setDraft}
      onStop={() => {}}
      onSubmit={handleSubmit}
      placeholder="Message Ægentica"
      value={draft}
    />
  );

  if (leaving) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <ConversationFrame>
          <UserBubble
            className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
            text={leaving.message}
          />
          <ThinkingLine className="animate-in fade-in-0 delay-150 duration-300 fill-mode-both" />
        </ConversationFrame>
        <ComposerDock>
          <div ref={composerRef}>{composer}</div>
        </ComposerDock>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-14 md:pt-8 [@media(max-height:520px)]:pt-12">
      {toastError ? (
        <ErrorToast message={toastError} onDismiss={() => setDismissedError(toastError)} />
      ) : null}

      <HomeStage>
        <HomeGreeting />
        <div className="shrink-0 px-4 sm:px-0" ref={composerRef}>
          {composer}
        </div>
        <HomeHint />
      </HomeStage>
    </div>
  );
}

/**
 * The greeting, the composer and the hint sit in the upper part of the page,
 * where the eye lands, until the first message moves the composer to the
 * bottom for the conversation. Shared with the loading skeleton.
 */
export function HomeStage({ children }: { readonly children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col pt-[7vh] sm:px-6 sm:pt-[13vh] md:pt-[15vh] [@media(max-height:520px)]:pt-1">
      {children}
    </div>
  );
}

/** Shared with the loading skeleton so the first paint and the live page match. */
export function HomeGreeting() {
  return (
    // Hidden when the keyboard leaves too little room, so the page never scrolls.
    <div className="flex shrink-0 flex-col items-center px-4 pb-5 text-center sm:pb-6 [@media(max-height:520px)]:hidden">
      <img
        alt="Ægentica"
        className="mb-5 size-11 select-none invert sm:size-12 dark:invert-0"
        draggable={false}
        src="/aegentica.svg"
      />
      <h1 className="text-2xl font-medium tracking-tight sm:text-[28px]">
        What should we work on?
      </h1>
      <p className="mt-1.5 hidden text-sm leading-6 text-muted-foreground sm:block">
        Ask, research, build, or hand off a task.
      </p>
    </div>
  );
}

/** How to reach skills and agents now that the box has no menus. */
export function HomeHint({ className }: { readonly className?: string }) {
  return (
    <p
      className={cn(
        "px-4 pt-3 text-center text-xs leading-5 text-muted-foreground sm:px-0 [@media(max-height:520px)]:hidden",
        className,
      )}
    >
      Type <kbd className="rounded border border-border/70 bg-muted/50 px-1 font-sans">/</kbd> for a
      skill or <kbd className="rounded border border-border/70 bg-muted/50 px-1 font-sans">@</kbd>{" "}
      for an agent.
    </p>
  );
}

function getHomeComposerDisabledReason({
  setupStatus,
  submitting,
}: {
  readonly setupStatus: SetupStatus;
  readonly submitting: boolean;
}) {
  if (!setupStatus.appReady) {
    const missing = setupStatus.missing.length
      ? ` Missing: ${setupStatus.missing.join(", ")}.`
      : "";

    return `Finish setup before chatting.${missing}`;
  }

  if (submitting) {
    return "Preparing chat.";
  }

  return undefined;
}
