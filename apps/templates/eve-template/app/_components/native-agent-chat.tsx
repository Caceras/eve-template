"use client";

import type { UserContent } from "ai";
import { useEveAgent } from "eve/react";
import { AlertCircleIcon, BrainIcon, PlusIcon, SquareIcon } from "lucide-react";
import { useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
  ConversationTopFade,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputButton,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  usePromptInputAttachments,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AgentMessage } from "./native-agent-message";

const AGENT_NAME = "Web channel";

export function NativeAgentChat({
  sessionId,
  sessionless = false,
}: {
  readonly sessionId?: string;
  readonly sessionless?: boolean;
}) {
  const [cancellationError, setCancellationError] = useState<string>();
  const [hasInputText, setHasInputText] = useState(false);
  const agent = useEveAgent({
    initialSession:
      sessionId === undefined
        ? undefined
        : {
            sessionId,
            streamIndex: 0,
          },
    resume: sessionId !== undefined,
    onSessionChange(session) {
      if (sessionId === undefined && session !== undefined) {
        // Next patches window.history to navigate, which would detach the active stream.
        History.prototype.replaceState.call(
          window.history,
          window.history.state,
          "",
          `/native/s/${encodeURIComponent(session.sessionId)}`,
        );
      }
    },
  });

  const isBusy = agent.status === "submitted" || agent.status === "streaming";
  const isResuming = agent.status === "resuming";
  const isEmpty = agent.data.messages.length === 0;
  const lastMessage = agent.data.messages.at(-1);
  const isPendingAssistantShell =
    lastMessage?.role === "assistant" &&
    lastMessage.parts.every((part) => part.type === "step-start");
  const showPendingThinking =
    isBusy &&
    (agent.status === "submitted" || lastMessage?.role !== "assistant" || isPendingAssistantShell);
  const turnFailure = isBusy || isResuming ? undefined : getLatestTurnFailure(agent.events);
  const errorMessage = cancellationError ?? agent.error?.message ?? turnFailure;
  const hasConversationContent = sessionless || !isEmpty || errorMessage !== undefined;
  const showConversationLayout = isResuming || hasConversationContent;
  const activeSessionId = sessionId ?? agent.session?.sessionId;

  const requestCancellation = () => {
    setCancellationError(undefined);
    void agent.cancel().catch((error: unknown) => {
      setCancellationError(toErrorMessage(error));
    });
  };

  const handleSubmit = async (message: PromptInputMessage) => {
    const text = message.text.trim();
    if ((text.length === 0 && message.files.length === 0) || isResuming) return;

    setHasInputText(false);
    setCancellationError(undefined);
    const options = isBusy ? { turnPolicy: "steer" as const } : undefined;

    if (message.files.length === 0) {
      await agent.send(text, options);
      return;
    }

    const parts: UserContent = [];
    if (text.length > 0) {
      parts.push({ text, type: "text" });
    }
    for (const file of message.files) {
      parts.push({
        data: file.url,
        filename: file.filename,
        mediaType: file.mediaType,
        type: "file",
      });
    }

    await agent.send(parts, options);
  };

  const composer = (
    <PromptInput onSubmit={handleSubmit}>
      <PromptInputTextarea
        disabled={isResuming}
        onChange={(event) => setHasInputText(event.currentTarget.value.trim().length > 0)}
        placeholder="Message Ægentica"
      />
      <ComposerAction
        hasInputText={hasInputText}
        isBusy={isBusy}
        isResuming={isResuming}
        onCancel={requestCancellation}
      />
    </PromptInput>
  );

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden bg-background text-foreground">
      {showConversationLayout ? (
        <ChatHeader canStartNewChat={activeSessionId !== undefined} />
      ) : null}

      {showConversationLayout ? (
        <Conversation
          className="min-h-0 flex-1"
          initial={sessionId === undefined ? undefined : false}
          resize={activeSessionId === undefined ? "smooth" : "instant"}
          scrollRestorationKey={
            isEmpty || activeSessionId === undefined
              ? undefined
              : `eve:web-chat-scroll:${activeSessionId}`
          }
        >
          <ConversationTopFade className="top-14" />
          <ConversationContent className="mx-auto w-full max-w-2xl gap-5 px-4 pb-36 pt-20 sm:gap-6 sm:px-6">
            {agent.data.messages.map((message, index) =>
              showPendingThinking &&
              isPendingAssistantShell &&
              message.id === lastMessage.id ? null : (
                <AgentMessage
                  canRespond={!isBusy && !isResuming}
                  isStreaming={
                    agent.status === "streaming" && index === agent.data.messages.length - 1
                  }
                  key={message.id}
                  message={message}
                  onInputResponses={(inputResponses) => {
                    setCancellationError(undefined);
                    return agent.respond(inputResponses);
                  }}
                />
              ),
            )}
            {showPendingThinking ? <PendingThinking /> : null}
            {errorMessage ? <ErrorMessage message={errorMessage} /> : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      ) : null}

      <div
        className={cn(
          "mx-auto w-full px-4 sm:px-6",
          showConversationLayout
            ? "fixed bottom-0 left-1/2 z-20 max-w-2xl -translate-x-1/2 bg-gradient-to-t from-background via-background/95 to-transparent px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5"
            : "flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-3 pb-[10vh] sm:px-6",
        )}
      >
        {showConversationLayout ? null : (
          <div className="flex flex-col items-center gap-3 text-center">
            <img
              alt="Ægentica"
              className="size-16 select-none invert sm:size-20 md:size-24 dark:invert-0"
              draggable={false}
              src="/aegentica.svg"
            />
            <span className="sr-only">{AGENT_NAME}</span>
          </div>
        )}
        <div className="w-full [&_[data-slot=input-group]]:rounded-[20px] [&_[data-slot=input-group]]:border-black/[0.06] [&_[data-slot=input-group]]:bg-white/92 [&_[data-slot=input-group]]:shadow-[0_10px_40px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] [&_[data-slot=input-group]]:backdrop-blur-xl dark:[&_[data-slot=input-group]]:border-white/[0.08] dark:[&_[data-slot=input-group]]:bg-white/[0.06]">{composer}</div>
      </div>
    </main>
  );
}

function ComposerAction({
  hasInputText,
  isBusy,
  isResuming,
  onCancel,
}: {
  readonly hasInputText: boolean;
  readonly isBusy: boolean;
  readonly isResuming: boolean;
  readonly onCancel: () => void;
}) {
  const attachments = usePromptInputAttachments();
  const canSubmit = hasInputText || attachments.files.length > 0;

  if (!isBusy || canSubmit) {
    return <PromptInputSubmit disabled={isResuming} />;
  }

  return (
    <PromptInputButton
      aria-label="Stop"
      className="absolute right-2.5 bottom-2.5"
      onClick={onCancel}
      variant="outline"
    >
      <SquareIcon className="size-3 fill-current" />
    </PromptInputButton>
  );
}

function ErrorMessage({ message }: { readonly message: string }) {
  return (
    <Message className="max-w-full" from="assistant">
      <MessageContent>
        <div
          className="flex w-full items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm"
          role="alert"
        >
          <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="font-medium">Request failed</p>
            <p className="mt-0.5 text-muted-foreground">{message}</p>
          </div>
        </div>
      </MessageContent>
    </Message>
  );
}

function ChatHeader({ canStartNewChat }: { readonly canStartNewChat: boolean }) {
  return (
    <header className="pointer-events-none fixed top-0 right-0 left-0 z-20 h-14">
      <div className="relative mx-auto flex h-full w-full max-w-2xl items-center justify-center bg-background px-20">
        <span className="truncate text-muted-foreground text-sm">{AGENT_NAME}</span>
        {canStartNewChat ? (
          <Button
            aria-label="Start a new chat"
            className="pointer-events-auto fixed right-3 top-[max(0.5rem,env(safe-area-inset-top))] pr-3 sm:right-5"
            onClick={() => window.location.assign("/native")}
            size="sm"
            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-4" />
            <span className="hidden font-normal text-sm sm:inline">New chat</span>
          </Button>
        ) : null}
      </div>
    </header>
  );
}

function PendingThinking() {
  return (
    <Message aria-live="polite" from="assistant">
      <MessageContent>
        <div className="mb-4 flex w-full items-center gap-2 text-muted-foreground text-sm">
          <BrainIcon className="size-4" />
          <Shimmer duration={1}>Thinking</Shimmer>
        </div>
      </MessageContent>
    </Message>
  );
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to cancel the response.";
}

function getLatestTurnFailure(
  events: ReturnType<typeof useEveAgent>["events"],
): string | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event.type === "turn.failed") {
      return event.data.code === "MODEL_CALL_FAILED"
        ? "The model is temporarily unavailable. Please try again."
        : event.data.message;
    }

    if (event.type === "turn.completed" || event.type === "turn.cancelled") {
      return undefined;
    }

    if (event.type === "message.received") {
      return undefined;
    }
  }

  return undefined;
}
