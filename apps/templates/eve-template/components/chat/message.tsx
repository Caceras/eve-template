"use client";

import type { EveDynamicToolPart, EveMessage, EveMessagePart } from "eve/react";
import {
  BrainIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckIcon,
  CircleSlashIcon,
  CopyIcon,
  FileIcon,
  Loader2Icon,
  Share2Icon,
  SquareIcon,
  Volume2Icon,
  XIcon,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { BrandIcon } from "@/components/brand-icon";
import { ImageViewer } from "@/components/chat/image-viewer";
import { Markdown } from "@/components/chat/markdown";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { serviceBrand } from "@/lib/brands";
import { canShare, shareOrCopy } from "@/lib/pwa/share";
import { cn } from "@/lib/utils";
import { readVoicePreferences } from "@/lib/voice/preferences";
import { announceReplySpoken, isVoiceConversation } from "@/lib/voice/conversation";
import { canSpeak, speak, stopSpeaking } from "@/lib/voice/speech";

const STREAM_TEXT_CACHE_LIMIT = 40;
const streamingTextCache = new Map<string, string>();

export type AgentInputResponse = {
  readonly optionId?: string;
  readonly requestId: string;
  readonly text?: string;
};

/** Answers input requests; resolves false when the answer was not accepted. */
export type InputResponder = (
  responses: readonly AgentInputResponse[],
) => void | boolean | Promise<void | boolean>;

export function AgentMessage({
  canRespond,
  isStreaming,
  message,
  onInputResponses,
}: {
  readonly canRespond: boolean;
  readonly isStreaming: boolean;
  readonly message: EveMessage;
  readonly onInputResponses: InputResponder;
}) {
  const lastTextIndex = message.parts.reduce(
    (last, part, index) => (part.type === "text" ? index : last),
    -1,
  );
  const isUser = message.role === "user";
  const replyText = isUser
    ? ""
    : message.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("\n\n")
        .trim();

  return (
    <article
      // Screen readers hear who spoke, and wait for a reply that is still streaming.
      aria-busy={isStreaming && !isUser ? true : undefined}
      aria-label={isUser ? "You" : "Ægentica"}
      className={cn(
        "group flex w-full min-w-0",
        // A long chat lays out only the messages near the screen.
        !isStreaming && "[content-visibility:auto] [contain-intrinsic-size:auto_480px]",
        isUser ? "justify-end" : "justify-start",
        // A reply settles in instead of popping; the sent message is already in place.
        isStreaming && !isUser && "animate-in fade-in-0 slide-in-from-bottom-1 duration-300",
        message.metadata?.optimistic ? "opacity-90" : undefined,
      )}
    >
      <div
        className={cn(
          "min-w-0",
          isUser
            ? "max-w-[82%] rounded-[20px] bg-muted/75 px-3.5 py-2 text-[15px] leading-6 text-foreground sm:max-w-[78%]"
            : "w-full max-w-none text-sm leading-relaxed text-foreground",
        )}
      >
        <AgentMessageParts
          canRespond={canRespond}
          isUser={isUser}
          lastTextIndex={lastTextIndex}
          messageId={message.id}
          onInputResponses={onInputResponses}
          parts={message.parts}
          showCaret={isStreaming && message.role === "assistant"}
        />
        {!isUser && replyText ? <ReplyActions isStreaming={isStreaming} text={replyText} /> : null}
      </div>
    </article>
  );
}

/**
 * Copy, share and read-aloud under a finished reply; also speaks new replies
 * when the user chose that. Share opens the device's share sheet where there
 * is one.
 */
function ReplyActions({
  isStreaming,
  text,
}: {
  readonly isStreaming: boolean;
  readonly text: string;
}) {
  const [copied, setCopied] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speechError, setSpeechError] = useState("");
  const [speechAvailable, setSpeechAvailable] = useState(false);
  const [shareAvailable, setShareAvailable] = useState(false);
  const wasStreaming = useRef(isStreaming);

  useEffect(() => {
    setSpeechAvailable(canSpeak());
    setShareAvailable(canShare());
  }, []);
  useEffect(() => {
    const conversation = isVoiceConversation();
    if (wasStreaming.current && !isStreaming && conversation && !canSpeak()) announceReplySpoken();
    if (wasStreaming.current && !isStreaming && canSpeak()) {
      if (conversation || readVoicePreferences().readReplies) {
        setSpeaking(true);
        setSpeechError("");
        speak(text, {
          onEnd: () => {
            setSpeaking(false);
            if (conversation) announceReplySpoken();
          },
          onError: setSpeechError,
        });
      }
    }
    wasStreaming.current = isStreaming;
  }, [isStreaming, text]);

  if (isStreaming) return null;

  return (
    <div className="-ml-2 mt-1 flex items-center gap-0.5 text-muted-foreground opacity-100 transition-opacity pointer-fine:md:opacity-0 pointer-fine:md:group-hover:opacity-100 pointer-fine:md:focus-within:opacity-100">
      <Button
        aria-label={copied ? "Copied" : "Copy reply"}
        className="size-10 pointer-fine:md:size-8"
        onClick={() => {
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          });
        }}
        size="icon-sm"
        type="button"
        variant="ghost"
      >
        {copied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
      </Button>
      {shareAvailable ? (
        <Button
          aria-label="Share reply"
          className="size-10 pointer-fine:md:size-8"
          onClick={() => void shareOrCopy({ text }).catch(() => undefined)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <Share2Icon className="size-3.5" />
        </Button>
      ) : null}
      {speechAvailable ? (
        <Button
          aria-label={speaking ? "Stop reading" : "Read aloud"}
          className="size-10 pointer-fine:md:size-8"
          onClick={() => {
            if (speaking) {
              stopSpeaking();
              setSpeaking(false);
              return;
            }
            setSpeaking(true);
            setSpeechError("");
            speak(text, { onEnd: () => setSpeaking(false), onError: setSpeechError });
          }}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {speaking ? (
            <SquareIcon className="size-3 fill-current" />
          ) : (
            <Volume2Icon className="size-3.5" />
          )}
        </Button>
      ) : null}
      {speechError ? (
        <p className="ml-1 truncate text-xs text-destructive" role="alert" title={speechError}>
          {speechError}
        </p>
      ) : null}
    </div>
  );
}

function AgentMessageParts({
  canRespond,
  isUser,
  lastTextIndex,
  messageId,
  onInputResponses,
  parts,
  showCaret,
}: {
  readonly canRespond: boolean;
  readonly isUser: boolean;
  readonly lastTextIndex: number;
  readonly messageId: string;
  readonly onInputResponses: InputResponder;
  readonly parts: readonly EveMessagePart[];
  readonly showCaret: boolean;
}) {
  const elements: ReactNode[] = [];
  let pendingTools: EveDynamicToolPart[] = [];

  const flushTools = (isSettled: boolean) => {
    if (pendingTools.length === 0) {
      return;
    }

    const partsForGroup = pendingTools;

    const groupKey = partsForGroup.map((part) => part.toolCallId).join(":");
    elements.push(
      <ToolGroup
        canRespond={canRespond}
        isSettled={isSettled}
        key={`tools:${groupKey}`}
        onInputResponses={onInputResponses}
        parts={partsForGroup}
      />,
    );
    const images = partsForGroup.flatMap(generatedImages);
    if (images.length > 0)
      elements.push(<GeneratedImages images={images} key={`images:${groupKey}`} />);
    pendingTools = [];
  };

  parts.forEach((part, index) => {
    if (part.type === "dynamic-tool") {
      pendingTools.push(part);
      return;
    }

    // A tool call followed by more of a reply that is still streaming may yet run.
    flushTools(!showCaret);
    const key = partKey(part, index);

    elements.push(
      <AgentMessagePart
        isUser={isUser}
        key={key}
        part={part}
        showCaret={showCaret && index === lastTextIndex}
        streamKey={`${messageId}:${key}`}
      />,
    );
  });

  flushTools(!showCaret);

  return elements;
}

function AgentMessagePart({
  isUser,
  part,
  showCaret,
  streamKey,
}: {
  readonly isUser: boolean;
  readonly part: EveMessagePart;
  readonly showCaret: boolean;
  readonly streamKey: string;
}) {
  switch (part.type) {
    case "step-start":
      return null;
    case "text":
      return isUser ? (
        <UserTextPart text={part.text} />
      ) : (
        <AssistantTextPart showCaret={showCaret} streamKey={streamKey} text={part.text} />
      );
    case "reasoning":
      return <ReasoningPart isStreaming={part.state === "streaming"} text={part.text} />;
    case "file":
      return <AttachmentPart part={part} />;
    case "dynamic-tool":
      return null;
  }
}

type EveFilePart = Extract<EveMessagePart, { type: "file" }>;

/**
 * A file sent with a message, as on the native page: a picture as a thumbnail
 * that opens the full-screen viewer, any other file as a chip with its name,
 * type and size.
 */
function AttachmentPart({ part }: { readonly part: EveFilePart }) {
  const [viewing, setViewing] = useState(false);
  const label = part.filename ?? "Attachment";

  if (part.mediaType.startsWith("image/") && part.url) {
    return (
      <>
        <button
          aria-label={`View ${label}`}
          className="my-1 block overflow-hidden rounded-xl border border-border/60 bg-background/40"
          onClick={() => setViewing(true)}
          type="button"
        >
          <img
            alt={label}
            className="max-h-48 w-auto max-w-full object-cover"
            loading="lazy"
            src={part.url}
          />
        </button>
        <ImageViewer
          image={viewing ? { alt: label, name: label, url: part.url } : null}
          onClose={() => setViewing(false)}
        />
      </>
    );
  }

  const detail = [part.mediaType, formatBytes(part.size)].filter(Boolean).join(" · ");

  return (
    <span className="my-1 flex max-w-full items-center gap-2.5 rounded-lg border border-border/60 bg-background/60 px-2.5 py-1.5 text-left">
      <FileIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{label}</span>
        {detail ? (
          <span className="block truncate text-xs text-muted-foreground">{detail}</span>
        ) : null}
      </span>
    </span>
  );
}

function formatBytes(size: number | undefined) {
  if (size === undefined) return undefined;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function UserTextPart({ text }: { readonly text: string }) {
  return <div className="whitespace-pre-wrap break-words">{text}</div>;
}

function AssistantTextPart({
  showCaret,
  streamKey,
  text,
}: {
  readonly showCaret: boolean;
  readonly streamKey: string;
  readonly text: string;
}) {
  const smoothedText = useStreamingText(text, showCaret, streamKey);
  const isRevealActive = smoothedText.length > 0 && (showCaret || smoothedText !== text);
  const showVisibleCaret = showCaret && smoothedText.length > 0;

  return (
    <Markdown
      animated={isRevealActive ? STREAM_ANIMATION : undefined}
      caret={showVisibleCaret ? "block" : undefined}
      isAnimating={isRevealActive}
    >
      {smoothedText}
    </Markdown>
  );
}

/** New words fade in as the reveal reaches them. */
const STREAM_ANIMATION = { animation: "fadeIn", duration: 0.35, sep: "word", stagger: 0 } as const;
/** While streaming, the shown text closes in on what has arrived within about this long. */
const STREAM_LAG_MS = 500;
/** Once the reply is complete, the rest shows within about this long. */
const STREAM_CATCH_UP_MS = 260;
const STREAM_MIN_CPS = 30;
const STREAM_MAX_CPS = 2_400;

/**
 * Reveals a streaming reply at a steady pace instead of in the bursts it
 * arrives in: each frame shows as much as keeps the shown text about half a
 * second behind what has arrived, whole words at a time, so fast models
 * flow and slow ones never stall. A remount (leaving and returning to the
 * chat) continues from where it was.
 */
function useStreamingText(text: string, isStreaming: boolean, streamKey: string) {
  const [visibleText, setVisibleText] = useState(() =>
    getInitialStreamingText(text, isStreaming, streamKey),
  );
  const visibleTextRef = useRef(visibleText);
  const reduced = useReducedMotion();

  useEffect(() => {
    visibleTextRef.current = visibleText;
  }, [visibleText]);

  useEffect(() => {
    const current = visibleTextRef.current;
    const show = (next: string) => {
      visibleTextRef.current = next;
      rememberStreamingText(streamKey, next);
      setVisibleText(next);
    };

    // A rewrite (or a reduced-motion preference) shows the text as it is.
    if (current === text) return;
    if (!text.startsWith(current) || reduced) {
      show(text);
      return;
    }

    let frame = 0;
    let last = performance.now();
    let shown = current.length;
    const step = (now: number) => {
      const target = text.length;
      const remaining = target - shown;
      if (remaining <= 0) return;
      const lag = isStreaming ? STREAM_LAG_MS : STREAM_CATCH_UP_MS;
      const rate = Math.min(STREAM_MAX_CPS, Math.max(STREAM_MIN_CPS, (remaining / lag) * 1000));
      shown = Math.min(target, shown + (rate * (now - last)) / 1000);
      last = now;
      const cut = wordBoundary(text, Math.floor(shown), target);
      if (cut > visibleTextRef.current.length) show(text.slice(0, cut));
      if (cut < target) frame = window.requestAnimationFrame(step);
    };
    frame = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frame);
  }, [isStreaming, reduced, streamKey, text]);

  useEffect(() => {
    if (!isStreaming && visibleText === text) {
      streamingTextCache.delete(streamKey);
    }
  }, [isStreaming, streamKey, text, visibleText]);

  return visibleText;
}

/** The end of the word the reveal has reached, so words appear whole. */
function wordBoundary(text: string, at: number, end: number) {
  if (at >= end) return end;
  const space = text.indexOf(" ", at);
  const newline = text.indexOf("\n", at);
  const next = Math.min(space === -1 ? end : space, newline === -1 ? end : newline);
  return Math.min(end, next);
}

const reducedMotionQuery = () => window.matchMedia("(prefers-reduced-motion: reduce)");
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = reducedMotionQuery();
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

function getInitialStreamingText(text: string, isStreaming: boolean, streamKey: string) {
  const cachedText = streamingTextCache.get(streamKey);

  if (cachedText && text.startsWith(cachedText)) {
    return cachedText;
  }

  return isStreaming ? "" : text;
}

function rememberStreamingText(streamKey: string, text: string) {
  if (!text) {
    return;
  }

  streamingTextCache.delete(streamKey);
  streamingTextCache.set(streamKey, text);

  if (streamingTextCache.size <= STREAM_TEXT_CACHE_LIMIT) {
    return;
  }

  const oldestKey = streamingTextCache.keys().next().value;

  if (oldestKey) {
    streamingTextCache.delete(oldestKey);
  }
}

/**
 * The model's reasoning: open while it streams, showing the last lines as
 * they arrive, then folded to one line ("Thought for 12s") that a tap opens
 * and closes again. A fold or unfold by hand is kept.
 */
function ReasoningPart({
  isStreaming,
  text,
}: {
  readonly isStreaming: boolean;
  readonly text: string;
}) {
  const [open, setOpen] = useState(isStreaming);
  const [seconds, setSeconds] = useState<number | null>(null);
  const startedAt = useRef<number | null>(isStreaming ? Date.now() : null);
  const touched = useRef(false);
  const preview = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isStreaming) {
      startedAt.current ??= Date.now();
      if (!touched.current) setOpen(true);
      return;
    }
    if (startedAt.current !== null) {
      setSeconds(Math.max(1, Math.round((Date.now() - startedAt.current) / 1000)));
      startedAt.current = null;
      if (!touched.current) setOpen(false);
    }
  }, [isStreaming]);

  // The preview keeps the newest reasoning in view.
  useEffect(() => {
    const box = preview.current;
    if (isStreaming && box) box.scrollTop = box.scrollHeight;
  }, [isStreaming, text]);

  const label = isStreaming
    ? "Thinking…"
    : seconds === null
      ? "Reasoning"
      : `Thought for ${seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}`;

  return (
    <Collapsible
      className="my-3 w-full"
      onOpenChange={(next) => {
        touched.current = true;
        setOpen(next);
      }}
      open={open}
    >
      <CollapsibleTrigger
        className="group/reasoning flex min-h-9 items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground pointer-fine:md:min-h-7"
        title={open ? "Hide reasoning" : "Show reasoning"}
      >
        <BrainIcon className="size-3.5 shrink-0" />
        <span className={isStreaming ? "shimmer-text" : undefined}>{label}</span>
        <ChevronDownIcon
          className={cn(
            "size-3.5 shrink-0 transition-transform duration-200",
            open ? "rotate-180" : "",
          )}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <div
          className={cn(
            "mt-2 border-l-2 border-border/70 pl-3 text-muted-foreground [&_li]:text-sm [&_li]:text-muted-foreground [&_p]:text-sm [&_p]:text-muted-foreground",
            isStreaming &&
              "max-h-36 overflow-y-auto [mask-image:linear-gradient(to_bottom,transparent,black_2rem)] [scrollbar-width:none]",
          )}
          ref={preview}
        >
          <Markdown>{text}</Markdown>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolGroup({
  canRespond,
  isSettled,
  onInputResponses,
  parts,
}: {
  readonly canRespond: boolean;
  readonly isSettled: boolean;
  readonly onInputResponses: InputResponder;
  readonly parts: readonly EveDynamicToolPart[];
}) {
  const shouldOpen = parts.some(needsInputResponse);
  const [open, setOpen] = useState(shouldOpen);
  const status = getSettledToolStatus(getToolGroupStatus(parts), isSettled && !shouldOpen);
  const label = summarizeToolGroup(parts, status);
  const canExpand = parts.length > 1 ? parts.some(hasToolDetails) : hasToolDetails(parts[0]!);

  useEffect(() => {
    if (shouldOpen) {
      setOpen(true);
    }
  }, [shouldOpen]);

  return (
    <Collapsible
      className="my-2"
      onOpenChange={canExpand ? setOpen : undefined}
      open={canExpand ? open : false}
    >
      <CollapsibleTrigger
        className={cn(
          "group flex max-w-full items-center gap-2 py-0.5 text-left text-sm leading-6 text-muted-foreground transition-colors",
          canExpand ? "cursor-pointer hover:text-foreground" : "cursor-default",
        )}
        disabled={!canExpand}
      >
        <ToolStatusIcon status={status} />
        <span className="truncate">{label}</span>
        {status === "skipped" ? (
          <span className="shrink-0 text-xs">{toolStatusLabel(status)}</span>
        ) : (
          <span className="sr-only">{toolStatusLabel(status)}</span>
        )}
        {canExpand ? (
          <ChevronRightIcon
            className={cn(
              "size-3 shrink-0 self-center transition-all",
              open ? "rotate-90 opacity-100" : "opacity-0 group-hover:opacity-100",
            )}
          />
        ) : null}
      </CollapsibleTrigger>
      {canExpand ? (
        <CollapsibleContent className="ml-2 border-l border-border/40 pl-3 pt-0.5 pb-1">
          {parts.length === 1 ? (
            <ToolDetails
              canRespond={canRespond}
              onInputResponses={onInputResponses}
              part={parts[0]!}
            />
          ) : (
            parts.map((part) => (
              <ToolCallItem
                canRespond={canRespond}
                isSettled={isSettled}
                key={part.toolCallId}
                onInputResponses={onInputResponses}
                part={part}
              />
            ))
          )}
        </CollapsibleContent>
      ) : null}
    </Collapsible>
  );
}

type GeneratedImage = { url: string; alt: string };

/** Images the generate_image tool saved; shown in the conversation, not hidden in the tool card. */
function generatedImages(part: EveDynamicToolPart): GeneratedImage[] {
  if (part.state !== "output-available") return [];
  const images = asRecord(part.output)?.images;
  if (!Array.isArray(images)) return [];
  return images.flatMap((image) => {
    const record = asRecord(image);
    const url = readString(record, ["url"]);
    return url?.startsWith("/api/media/") ? [{ url, alt: readString(record, ["alt"]) ?? "" }] : [];
  });
}

function GeneratedImages({ images }: { readonly images: readonly GeneratedImage[] }) {
  const [viewing, setViewing] = useState<GeneratedImage | null>(null);
  return (
    <div className={cn("my-2 grid gap-2", images.length > 1 && "sm:grid-cols-2")}>
      {images.map((image) => (
        <a
          aria-label={image.alt ? `View image: ${image.alt}` : "View image"}
          className="block overflow-hidden rounded-xl border border-border/60 bg-muted/30"
          href={image.url}
          key={image.url}
          // A tap opens the full-screen viewer; Ctrl/⌘-click still opens a tab.
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
            event.preventDefault();
            setViewing(image);
          }}
          rel="noreferrer"
          target="_blank"
        >
          <img alt={image.alt} className="h-auto w-full" loading="lazy" src={image.url} />
        </a>
      ))}
      <ImageViewer image={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function ToolCallItem({
  canRespond,
  isSettled,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly isSettled: boolean;
  readonly onInputResponses: InputResponder;
  readonly part: EveDynamicToolPart;
}) {
  const shouldOpen = needsInputResponse(part);
  const [open, setOpen] = useState(shouldOpen);
  const status = getSettledToolStatus(getToolStatus(part), isSettled && !shouldOpen);
  const canExpand = hasToolDetails(part);

  useEffect(() => {
    if (shouldOpen) {
      setOpen(true);
    }
  }, [shouldOpen]);

  const button = (
    <button
      className={cn(
        "flex w-full items-center gap-2 py-0.5 text-left text-sm leading-6 text-muted-foreground transition-colors",
        canExpand ? "cursor-pointer hover:text-foreground" : "cursor-default",
      )}
      type="button"
    >
      <ToolStatusIcon status={status} />
      <ToolNameLabel part={part} />
      <span className="truncate text-foreground/80">{describeToolAction(part, status)}</span>
      {canExpand ? (
        <ChevronRightIcon
          className={cn(
            "ml-auto size-3 shrink-0 self-center transition-transform",
            open ? "rotate-90" : "",
          )}
        />
      ) : null}
    </button>
  );

  if (!canExpand) {
    return <div className="py-0.5">{button}</div>;
  }

  return (
    <Collapsible className="py-0.5" onOpenChange={setOpen} open={open}>
      <CollapsibleTrigger asChild>{button}</CollapsibleTrigger>
      <CollapsibleContent className="mt-1 ml-5">
        <ToolDetails canRespond={canRespond} onInputResponses={onInputResponses} part={part} />
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolDetails({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: InputResponder;
  readonly part: EveDynamicToolPart;
}) {
  const hasOutput = part.state === "output-available" || part.state === "output-error";

  return (
    <div className="space-y-1.5">
      <InputRequestActions
        canRespond={canRespond}
        onInputResponses={onInputResponses}
        part={part}
      />
      <ToolPayload label="input" value={part.input} />
      {hasOutput ? (
        <ToolPayload
          label={part.state === "output-error" ? "error" : "result"}
          tone={part.state === "output-error" ? "destructive" : "default"}
          value={part.state === "output-error" ? part.errorText : part.output}
        />
      ) : null}
    </div>
  );
}

function ToolStatusIcon({ status }: { readonly status: ToolStatus }) {
  const className = "size-3 shrink-0";

  if (status === "running") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center self-center">
        <Loader2Icon className={cn(className, "animate-spin")} />
      </span>
    );
  }

  if (status === "skipped") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center self-center">
        <CircleSlashIcon className={cn(className, "text-muted-foreground")} />
      </span>
    );
  }

  if (status === "error" || status === "denied") {
    return (
      <span className="flex size-4 shrink-0 items-center justify-center self-center">
        <XIcon className={cn(className, "text-destructive")} />
      </span>
    );
  }

  return (
    <span className="flex size-4 shrink-0 items-center justify-center self-center">
      <CheckIcon className={cn(className, "text-emerald-500")} />
    </span>
  );
}

function ToolNameLabel({ part }: { readonly part: EveDynamicToolPart }) {
  const name = resolveToolName(part);
  // Tools of a connected service (github__…, linear…) carry its logo.
  const brand = serviceBrand(name);
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      {brand ? <BrandIcon brand={brand} className="size-3" name={name} /> : null}
      {formatToolName(name)}
    </span>
  );
}

function ToolPayload({
  label,
  tone = "default",
  value,
}: {
  readonly label: string;
  readonly tone?: "default" | "destructive";
  readonly value: unknown;
}) {
  if (value === undefined) {
    return null;
  }

  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <pre
        className={cn(
          "max-h-56 overflow-auto rounded bg-muted/30 p-2 font-mono text-[11px] leading-5 text-muted-foreground",
          tone === "destructive" ? "bg-destructive/10 text-destructive" : undefined,
        )}
      >
        {formatPayload(value)}
      </pre>
    </div>
  );
}

function InputRequestActions({
  canRespond,
  onInputResponses,
  part,
}: {
  readonly canRespond: boolean;
  readonly onInputResponses: InputResponder;
  readonly part: EveDynamicToolPart;
}) {
  const [freeformText, setFreeformText] = useState("");
  const promptId = useId();
  const inputRequest = part.toolMetadata?.eve?.inputRequest;

  if (!inputRequest) {
    return null;
  }

  const inputResponse = part.toolMetadata?.eve?.inputResponse;
  const selectedOption = inputRequest.options?.find(
    (option) => option.id === inputResponse?.optionId,
  );

  if (inputResponse) {
    return (
      <div className="rounded-md border border-border bg-background px-3 py-2 text-sm">
        <span className="text-muted-foreground">Responded: </span>
        <span className="font-medium">
          {selectedOption?.label ?? inputResponse.text ?? inputResponse.optionId}
        </span>
      </div>
    );
  }

  const sendTextResponse = async () => {
    const text = freeformText.trim();
    if (!text) {
      return;
    }
    // eve keeps a refused answer's prompt open: keep the text until it is accepted.
    if ((await onInputResponses([{ requestId: inputRequest.requestId, text }])) !== false)
      setFreeformText("");
  };

  return (
    <div className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
      <p className="text-sm text-muted-foreground" id={promptId}>
        {inputRequest.prompt}
      </p>
      {inputRequest.options?.length ? (
        <div className="flex flex-wrap gap-2">
          {inputRequest.options.map((option) => (
            <Button
              disabled={!canRespond}
              key={option.id}
              onClick={() => {
                void onInputResponses([
                  {
                    optionId: option.id,
                    requestId: inputRequest.requestId,
                  },
                ]);
              }}
              // Finger-sized under a finger, dense beside a mouse.
              className="h-11 pointer-fine:md:h-8"
              size="sm"
              type="button"
              variant={option.style === "danger" ? "destructive" : "default"}
            >
              {option.label}
            </Button>
          ))}
        </div>
      ) : null}
      {inputRequest.allowFreeform || inputRequest.display === "text" ? (
        <div className="flex gap-2">
          <Input
            aria-labelledby={promptId}
            className="h-11 pointer-fine:md:h-9"
            disabled={!canRespond}
            onChange={(event) => setFreeformText(event.target.value)}
            onKeyDown={(event) => {
              // Enter that confirms an IME composition (keyCode 229 in Safari) is not a reply.
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Enter") {
                event.preventDefault();
                sendTextResponse();
              }
            }}
            placeholder="Type a response"
            value={freeformText}
          />
          <Button
            className="h-11 pointer-fine:md:h-9"
            disabled={!canRespond || freeformText.trim().length === 0}
            onClick={sendTextResponse}
            type="button"
          >
            Reply
          </Button>
        </div>
      ) : null}
    </div>
  );
}

type ToolStatus = "completed" | "denied" | "error" | "running" | "skipped";

function needsInputResponse(part: EveDynamicToolPart) {
  return Boolean(part.toolMetadata?.eve?.inputRequest && !part.toolMetadata.eve.inputResponse);
}

function hasToolDetails(part: EveDynamicToolPart) {
  if (isConnectionSearchTool(part)) {
    return false;
  }

  const hasInput = part.input !== undefined && formatPayload(part.input).trim().length > 0;
  const hasOutput =
    part.state === "output-available" && formatPayload(part.output).trim().length > 0;
  const hasError = part.state === "output-error" && part.errorText.trim().length > 0;

  return hasInput || hasOutput || hasError || Boolean(part.toolMetadata?.eve?.inputRequest);
}

function isConnectionSearchTool(part: EveDynamicToolPart) {
  const normalized = normalizeToolName(resolveToolName(part));

  return normalized.includes("connection") && normalized.includes("search");
}

function getToolStatus(part: EveDynamicToolPart): ToolStatus {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
    case "approval-requested":
    case "approval-responded":
      return "running";
    case "output-available":
      return "completed";
    case "output-denied":
      return "denied";
    case "output-error":
      return "error";
  }
}

/** A call still waiting when its reply finished never ran (a cancelled or failed turn). */
function getSettledToolStatus(status: ToolStatus, isSettled: boolean): ToolStatus {
  return isSettled && status === "running" ? "skipped" : status;
}

function getToolGroupStatus(parts: readonly EveDynamicToolPart[]): ToolStatus {
  const statuses = parts.map(getToolStatus);

  if (statuses.includes("error")) {
    return "error";
  }

  if (statuses.includes("denied")) {
    return "denied";
  }

  if (statuses.includes("running")) {
    return "running";
  }

  if (statuses.every((status) => status === "skipped")) {
    return "skipped";
  }

  return "completed";
}

function toolStatusLabel(status: ToolStatus) {
  switch (status) {
    case "completed":
      return "Complete";
    case "denied":
      return "Denied";
    case "error":
      return "Error";
    case "running":
      return "Running";
    case "skipped":
      return "Not run";
  }
}

function summarizeToolGroup(parts: readonly EveDynamicToolPart[], status: ToolStatus) {
  if (parts.length === 1) {
    return describeToolAction(parts[0]!, status);
  }

  const counts = new Map<string, number>();

  for (const part of parts) {
    const category = toolCategory(resolveToolName(part));
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  const labels: string[] = [];
  const order: [string, string, string, string][] = [
    ["searched", "Searched", "thing", "things"],
    ["read", "Read", "item", "items"],
    ["wrote", "Wrote", "item", "items"],
    ["ran", "Ran", "action", "actions"],
  ];

  for (const [key, verb, singular, plural] of order) {
    const count = counts.get(key);

    if (count) {
      labels.push(`${verb} ${count} ${count === 1 ? singular : plural}`);
    }
  }

  return labels.join(", ") || `Used ${parts.length} tools`;
}

function toolCategory(name: string) {
  const normalized = normalizeToolName(name);

  if (normalized.includes("search") || normalized.includes("grep")) {
    return "searched";
  }

  if (normalized.includes("read") || normalized.includes("fetch")) {
    return "read";
  }

  if (normalized.includes("write") || normalized.includes("edit")) {
    return "wrote";
  }

  return "ran";
}

function describeToolAction(part: EveDynamicToolPart, status = getToolStatus(part)) {
  const name = resolveToolName(part);
  const normalized = normalizeToolName(name);
  const input = asRecord(part.input);
  const query = readString(input, ["query", "q", "search", "pattern", "prompt", "text"]);
  const path = readString(input, ["path", "filePath", "filename"]);
  const command = readString(input, ["command", "cmd"]);
  const url = readString(input, ["url", "href"]);
  const connection = readString(input, ["connection", "connectionName", "connector", "source"]);

  if (normalized.includes("connection") && normalized.includes("search")) {
    const verb = status === "running" ? "Searching" : "Searched";
    const connectionName = resolveConnectionName(name, connection);

    if (connectionName) {
      return `${verb} ${formatDisplayName(connectionName)}`;
    }

    if (query && query !== "*") {
      return `${verb} ${truncateInline(query, 72)}`;
    }

    return `${verb} connections`;
  }

  if (normalized.includes("search") || normalized.includes("grep")) {
    return query ? `Searched ${truncateInline(query, 72)}` : `Searched ${formatToolName(name)}`;
  }

  if (normalized.includes("read")) {
    return path ? `Read ${shortenPath(path)}` : `Read ${formatToolName(name)}`;
  }

  if (normalized.includes("write") || normalized.includes("edit")) {
    return path ? `Changed ${shortenPath(path)}` : `Changed ${formatToolName(name)}`;
  }

  if (normalized.includes("fetch")) {
    return url ? `Fetched ${truncateInline(url, 72)}` : `Fetched ${formatToolName(name)}`;
  }

  if (command) {
    return truncateInline(command, 72);
  }

  if (path) {
    return shortenPath(path);
  }

  if (query) {
    return truncateInline(query, 72);
  }

  return `Used ${formatToolName(name)}`;
}

function resolveToolName(part: EveDynamicToolPart) {
  const metadataName = part.toolMetadata?.eve?.name;
  return metadataName && metadataName !== "unknown" ? metadataName : part.toolName;
}

function formatToolName(name: string) {
  return normalizeToolName(name)
    .replace(/^connection search$/, "connection search")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeToolName(name: string) {
  return name.replace(/__/g, " ").replace(/[_-]/g, " ").trim().toLowerCase();
}

function formatDisplayName(value: string) {
  const cleaned = value
    .replace(/^mcp\./, "")
    .replace(/\.com(?:\/.*)?$/, "")
    .replace(/[_-]/g, " ");

  return cleaned
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveConnectionName(toolName: string, inputConnection?: string | null) {
  if (inputConnection && inputConnection !== "*") {
    return inputConnection;
  }

  const tokens = normalizeToolName(toolName).split(/\s+/).filter(Boolean);

  if (tokens[0] !== "connection" || tokens.length <= 2) {
    return null;
  }

  const connectionTokens = tokens
    .slice(1)
    .filter((token) => token !== "search" && token !== "tool" && token !== "tools");

  if (connectionTokens.length === 0) {
    return null;
  }

  return [...new Set(connectionTokens)].join(" ");
}

function shortenPath(filepath: string) {
  const parts = filepath.split("/").filter(Boolean);

  if (parts.length <= 2) {
    return filepath;
  }

  return `.../${parts.slice(-2).join("/")}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown> | null, keys: readonly string[]) {
  if (!source) {
    return null;
  }

  for (const key of keys) {
    const value = source[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function formatPayload(value: unknown): string {
  if (typeof value === "string") {
    return truncateText(value, 4000);
  }

  try {
    return truncateText(JSON.stringify(value, null, 2), 4000);
  } catch {
    return truncateText(String(value), 4000);
  }
}

function truncateInline(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1)}...`;
}

function truncateText(text: string, maxLength: number) {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength)}\n...`;
}

function partKey(part: EveMessagePart, index: number): string {
  switch (part.type) {
    case "dynamic-tool":
      return part.toolCallId;
    default:
      return `${part.type}:${index}`;
  }
}
