"use client";

import Link from "next/link";
import { ArrowUpRightIcon, SearchIcon, PencilLineIcon, ListChecksIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ComposerFooterControls,
  ErrorToast,
  type AgentChatControllerStatus,
} from "@/app/_components/agent-chat";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { ChatComposer } from "@/components/chat/composer";
import { getChatMessageLengthError } from "@/lib/chat/limits";
import { createProvisionalChatId, writePendingChatMessage } from "@/lib/chat/provisional-chat";
import type { SetupStatus } from "@/lib/chat/types";
import { moveComposerDraft } from "@/lib/chat/composer-draft";

const IDLE_CONTROLLER_STATUS: AgentChatControllerStatus = {
  isBusy: false,
  isDisabled: false,
  isEmpty: true,
};

export function HomeChatPage() {
  const { requestSignIn, setActiveChatId, setupStatus, viewer } = useChatShell();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const submittingRef = useRef(false);
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
    }
  }, [pathname]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const restoredDraft = window.sessionStorage.getItem("eve-chat-draft");

    if (restoredDraft) {
      setDraft(restoredDraft);
      window.sessionStorage.removeItem("eve-chat-draft");
    }
  }, [viewer]);

  useEffect(() => {
    setDismissedError(null);
  }, [clientError]);

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

      setActiveChatId(provisionalChatId);
      router.push(`/chat/${provisionalChatId}`, { scroll: false });
    },
    [requestSignIn, router, setActiveChatId, setupReady, setupStatus, submitting, viewer],
  );

  const composerDisabled = !setupReady;
  const composerDisabledReason = getHomeComposerDisabledReason({
    setupStatus,
    submitting,
  });

  if (pathname !== "/") {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-14 md:pt-8">
      {toastError ? (
        <ErrorToast message={toastError} onDismiss={() => setDismissedError(toastError)} />
      ) : null}

      <div className="flex min-h-0 flex-1 overflow-y-auto px-4 sm:px-6">
        <div className="flex min-h-0 flex-1 items-center justify-center py-6 sm:pb-[8vh]">
          <div className="w-full max-w-2xl space-y-6 sm:space-y-7">
            <div className="flex flex-col items-center text-center">
              <div className="mb-5 flex justify-center">
                <img
                  alt="Ægentica"
                  className="size-12 select-none invert sm:size-14 dark:invert-0"
                  draggable={false}
                  src="/aegentica.svg"
                />
              </div>
              <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">
                What would you like to work on?
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Bring a question, an idea, or a task. We’ll take it from here.
              </p>
            </div>
            <ChatComposer
              autoFocus
              disabled={composerDisabled}
              disabledReason={composerDisabledReason}
              footerStart={<ComposerFooterControls setupStatus={setupStatus} />}
              isBusy={IDLE_CONTROLLER_STATUS.isBusy}
              isPreparing={submitting}
              onChange={setDraft}
              onStop={() => {}}
              onSubmit={handleSubmit}
              placeholder="Message Ægentica"
              value={draft}
            />
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3 sm:gap-3">
              {[
                {
                  icon: SearchIcon,
                  title: "Explore a topic",
                  text: "Help me research a topic. First ask me what I want to understand, then make a clear plan.",
                },
                {
                  icon: PencilLineIcon,
                  title: "Make something clear",
                  text: "Help me turn a rough idea into a clear piece of writing. Ask me what I have in mind.",
                },
                {
                  icon: ListChecksIcon,
                  title: "Plan my next step",
                  text: "Help me break a task into practical next steps. Ask me what I want to accomplish.",
                },
              ].map(({ icon: Icon, title, text }) => (
                <Button
                  key={title}
                  variant="ghost"
                  className="h-11 justify-start gap-2.5 rounded-lg border border-border/70 px-3 text-xs font-normal text-muted-foreground"
                  onClick={() => {
                    setDraft(text);
                    document.querySelector<HTMLTextAreaElement>("textarea")?.focus();
                  }}
                >
                  <Icon className="size-4 shrink-0" />
                  {title}
                </Button>
              ))}
            </div>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              {setupStatus.storageMode === "browser"
                ? "Chat history stays in this browser."
                : "Your conversations are saved on your server and sync across your devices."}{" "}
              <Link
                href="/library"
                className="inline-flex items-center gap-0.5 underline underline-offset-4 hover:text-foreground"
              >
                Explore what’s possible
                <ArrowUpRightIcon className="size-3" />
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
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
