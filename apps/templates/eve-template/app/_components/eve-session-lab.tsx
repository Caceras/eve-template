"use client";

import { Client, type ClientSession } from "eve/client";
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  EraserIcon,
  InfoIcon,
  ListRestartIcon,
  ScanSearchIcon,
  SquareIcon,
  WandSparklesIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { forgetClientChatSession } from "@/lib/chat/persistence-client";
import {
  describeSessionError,
  describeSessionResult,
  errorDetail,
  type SessionAction,
} from "@/lib/chat/session-results";
import type { ActiveChat, ChatListItem } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { useChatShell } from "./chat-shell-context";
import { ConfirmButton } from "./confirm-button";
import { LoadError } from "./load-error";

type Status = { readonly tone: "info" | "success" | "error"; readonly text: string };
const STATUS_ICONS = { info: InfoIcon, success: CheckCircle2Icon, error: AlertCircleIcon };

export function EveSessionLab() {
  const { setupStatus, viewer } = useChatShell();
  const [chats, setChats] = useState<ChatListItem[]>([]);
  // Empty only after a load that worked; a failed load says so, with Retry.
  const [chatsState, setChatsState] = useState<"loading" | "ready" | "failed">("loading");
  const [chatsAttempt, setChatsAttempt] = useState(0);
  const [chatId, setChatId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState<Status>({
    tone: "info",
    text: "Choose a conversation or paste a session ID to inspect its durable event stream.",
  });
  const [events, setEvents] = useState<unknown[]>([]);
  const [busy, setBusy] = useState(false);
  const StatusIcon = STATUS_ICONS[status.tone];

  useEffect(() => {
    if (!viewer) return;
    let cancelled = false;
    void fetch("/api/chats", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load conversations.");
        return (await response.json()) as { chats?: ChatListItem[] };
      })
      .then((data) => {
        if (cancelled) return;
        setChats(data.chats ?? []);
        setChatsState("ready");
      })
      .catch(() => {
        if (!cancelled) setChatsState("failed");
      });
    return () => {
      cancelled = true;
    };
  }, [viewer, chatsAttempt]);

  const chooseChat = async (id: string) => {
    setChatId(id);
    let data: { chat?: ActiveChat | null };
    try {
      const response = await fetch(`/api/chats/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("Could not open the conversation.");
      data = await response.json();
    } catch {
      setStatus({
        tone: "error",
        text: "Couldn't open this conversation. Check the connection and try again.",
      });
      return;
    }
    const next = data.chat?.session?.sessionId;
    if (!next) {
      setSessionId("");
      setEvents([]);
      setStatus({
        tone: "info",
        text: "This conversation has no durable session yet. Send it a message first.",
      });
      return;
    }
    setSessionId(next);
    await inspect(next);
  };

  const withSession = async (
    action: SessionAction,
    operation: (session: ClientSession) => Promise<unknown>,
  ) => {
    const id = sessionId.trim();
    if (!id) return;
    setBusy(true);
    try {
      const session = new Client({ host: "" }).sessions.attach(id);
      setStatus({ tone: "success", text: describeSessionResult(action, await operation(session)) });
    } catch (error) {
      setStatus({ tone: "error", text: describeSessionError(action, error) });
    } finally {
      setBusy(false);
    }
  };

  const inspect = async (id = sessionId.trim()) => {
    if (!id) return;
    setBusy(true);
    try {
      const session = new Client({ host: "" }).sessions.attach(id);
      const collected: unknown[] = [];
      for await (const event of session.stream({ follow: false })) {
        collected.push(event);
      }
      setEvents(collected);
      setStatus({
        tone: "success",
        text: `Loaded ${collected.length} durable stream ${collected.length === 1 ? "event" : "events"}.`,
      });
    } catch (error) {
      setStatus({ tone: "error", text: `Couldn't inspect this session.${errorDetail(error)}` });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-16 sm:px-6 sm:pt-14">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Inspect a conversation&apos;s durable event stream and manage its low-level lifecycle
            when needed.
          </p>
        </div>

        <div className="mt-7 rounded-xl border bg-card p-4 sm:p-5">
          <div className="grid gap-2 sm:grid-cols-2">
            <Select disabled={busy || chats.length === 0} onValueChange={chooseChat} value={chatId}>
              <SelectTrigger
                aria-label="Conversation"
                className="w-full data-[size=default]:h-11 pointer-fine:md:data-[size=default]:h-9"
              >
                <SelectValue
                  placeholder={
                    !viewer
                      ? "Sign in to choose a conversation"
                      : chatsState === "loading"
                        ? "Loading conversations…"
                        : chatsState === "failed"
                          ? "Conversations unavailable"
                          : chats.length
                            ? "Choose a conversation"
                            : "No conversations yet"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {chats.map((chat) => (
                  <SelectItem key={chat.id} value={chat.id}>
                    {chat.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label="Session ID"
              autoCapitalize="off"
              autoCorrect="off"
              className="h-11 font-mono text-xs pointer-fine:md:h-9"
              onChange={(event) => {
                setChatId("");
                setSessionId(event.target.value);
              }}
              placeholder="Session ID"
              spellCheck={false}
              value={sessionId}
            />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Button
              disabled={busy || !sessionId.trim()}
              onClick={() => void inspect()}
              className="col-span-2 h-11 pointer-fine:md:h-8 lg:col-span-1"
              size="sm"
              variant="outline"
            >
              <ScanSearchIcon className="size-4" /> Inspect stream
            </Button>
            <Button
              disabled={busy || !sessionId.trim()}
              onClick={() => void withSession("cancel", (session) => session.cancel())}
              className="h-11 pointer-fine:md:h-8"
              size="sm"
              variant="outline"
            >
              <SquareIcon className="size-4" /> Cancel turn
            </Button>
            <Button
              disabled={busy || !sessionId.trim()}
              onClick={() => void withSession("compact", (session) => session.compact())}
              className="h-11 pointer-fine:md:h-8"
              size="sm"
              variant="outline"
            >
              <WandSparklesIcon className="size-4" /> Compact
            </Button>
            <ConfirmButton
              disabled={busy || !sessionId.trim()}
              title="Clear this conversation's context?"
              description="Ægentica forgets what was said so far in this conversation. The chat history stays visible."
              confirmLabel="Clear context"
              onConfirm={() => void withSession("clear", (session) => session.clear())}
              className="h-11 pointer-fine:md:h-8"
              size="sm"
              variant="outline"
            >
              <EraserIcon className="size-4" /> Clear context
            </ConfirmButton>
            <ConfirmButton
              disabled={busy || !sessionId.trim()}
              title="Reset this conversation?"
              description="The conversation starts over from nothing. This cannot be undone."
              confirmLabel="Reset"
              onConfirm={() =>
                void withSession("reset", async (session) => {
                  const result = await session.reset({
                    reason: "Requested from Ægentica Activity",
                  });
                  // A reset session refuses messages: the chat that used it starts a new one.
                  await forgetClientChatSession(setupStatus.storageMode, session.state.sessionId);
                  return result;
                })
              }
              className="h-11 pointer-fine:md:h-8"
              size="sm"
              variant="outline"
            >
              <ListRestartIcon className="size-4" /> Reset
            </ConfirmButton>
          </div>
          {viewer && chatsState === "failed" ? (
            <LoadError
              className="mt-3 p-3 sm:p-3"
              message="Couldn't load your conversations. A session ID still works."
              onRetry={() => {
                setChatsState("loading");
                setChatsAttempt((count) => count + 1);
              }}
            />
          ) : null}
          <div
            className={cn(
              "mt-4 flex items-start gap-2 rounded-lg bg-muted/45 px-3 py-2.5 text-xs text-muted-foreground",
              status.tone === "error" && "bg-destructive/10 text-destructive",
            )}
            role="status"
          >
            <StatusIcon aria-hidden className="mt-0.5 size-3.5 shrink-0" />
            <p className="break-words">{status.text}</p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-medium">Event stream</span>
            <span className="text-xs tabular-nums text-muted-foreground">
              {events.length} events
            </span>
          </div>
          {events.length ? (
            <pre className="max-h-[60vh] overflow-auto bg-muted/20 p-4 text-[11px] leading-5">
              {JSON.stringify(events, null, 2)}
            </pre>
          ) : (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium">No session loaded</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Inspect a session to view its durable event stream.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
