"use client";

import { ArrowUpIcon, AudioLinesIcon, Loader2Icon, MicIcon, SquareIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { useComposerMentions } from "./composer-mentions";
import { ComposerWorkspace } from "./composer-workspace";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getChatMessageLength, MAX_CHAT_MESSAGE_CHARS } from "@/lib/chat/limits";
import { cn } from "@/lib/utils";
import {
  onReplySpoken,
  setVoiceConversation,
  useVoiceConversation,
} from "@/lib/voice/conversation";
import { canDictate, startDictation, stopSpeaking } from "@/lib/voice/speech";

const MAX_TEXTAREA_HEIGHT = 168;
const subscribeNever = () => () => {};

export function ChatComposer({
  allowSteering = false,
  autoFocus = true,
  className,
  disabled = false,
  disabledReason,
  footerStart,
  isBusy = false,
  isPreparing = false,
  maxLength = MAX_CHAT_MESSAGE_CHARS,
  onChange,
  onStop,
  onSubmit,
  placeholder = "Ask Ægentica anything...",
  value,
}: {
  readonly allowSteering?: boolean;
  readonly autoFocus?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly footerStart?: ReactNode;
  readonly isBusy?: boolean;
  readonly isPreparing?: boolean;
  readonly maxLength?: number;
  readonly onChange: (value: string) => void;
  readonly onStop: () => void;
  readonly onSubmit: (value: string) => void | Promise<void>;
  readonly placeholder?: string;
  readonly value: string;
}) {
  const composerId = useId();
  const [workspace, setWorkspace] = useState({ hasFiles: false, busy: false });
  const [attachSlot, setAttachSlot] = useState<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaDisabled = disabled || isPreparing || (isBusy && !allowSteering);
  const mentions = useComposerMentions({
    disabled: textareaDisabled,
    onChange,
    textareaRef,
    value,
  });
  const trimmedValue = value.trim();
  const messageLength = getChatMessageLength(trimmedValue);
  const isOverMaxLength = messageLength > maxLength;
  // Rendered as supported on the server, so the voice buttons are already in
  // place on first paint; the rare browser without speech input drops them.
  const dictationSupported = useSyncExternalStore(subscribeNever, canDictate, () => true);
  const [dictationError, setDictationError] = useState("");
  const stopDictationRef = useRef<(() => void) | null>(null);
  const listening = stopDictationRef.current !== null;
  const [, setListeningTick] = useState(0);

  const conversation = useVoiceConversation();
  const latest = useRef({ onSubmit, isBusy, disabled });
  latest.current = { onSubmit, isBusy, disabled };

  // The conversation switch outlives this composer: sending from the home page
  // opens the chat page, whose composer continues the loop.
  useEffect(() => () => stopDictationRef.current?.(), []);

  // Hands-free turn: listen until a pause, send what was said, then wait for
  // the reply to finish speaking (onReplySpoken) before listening again.
  const listenForTurn = useCallback(() => {
    if (stopDictationRef.current || latest.current.isBusy || latest.current.disabled) return;
    setDictationError("");
    let heard = "";
    stopDictationRef.current = startDictation({
      singleUtterance: true,
      onText: (spoken) => {
        heard = spoken;
        onChange(spoken);
      },
      onEnd: (error) => {
        stopDictationRef.current = null;
        setListeningTick((tick) => tick + 1);
        if (error) {
          setDictationError(error);
          setVoiceConversation(false);
          return;
        }
        if (heard.trim()) {
          void latest.current.onSubmit(heard.trim());
        } else {
          // Nothing heard: keep the conversation open but wait for a tap.
          setVoiceConversation(false);
        }
      },
    });
    setListeningTick((tick) => tick + 1);
  }, [onChange]);

  useEffect(
    () => onReplySpoken(() => conversation && window.setTimeout(listenForTurn, 250)),
    [conversation, listenForTurn],
  );

  const toggleConversation = () => {
    if (conversation) {
      setVoiceConversation(false);
      stopDictationRef.current?.();
      stopSpeaking();
      return;
    }
    setVoiceConversation(true);
    listenForTurn();
  };

  const toggleDictation = () => {
    if (stopDictationRef.current) {
      stopDictationRef.current();
      return;
    }
    setDictationError("");
    const before = value.trimEnd();
    stopDictationRef.current = startDictation({
      onText: (spoken) => onChange(before ? `${before} ${spoken}` : spoken),
      onEnd: (error) => {
        stopDictationRef.current = null;
        setListeningTick((tick) => tick + 1);
        if (error) setDictationError(error);
        textareaRef.current?.focus();
      },
    });
    setListeningTick((tick) => tick + 1);
  };

  const fitTextarea = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // At most a quarter of the screen, so with the phone keyboard up Send stays in view.
    const cap = Math.min(MAX_TEXTAREA_HEIGHT, Math.round(window.innerHeight * 0.25));

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, cap);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > cap ? "auto" : "hidden";
  }, []);

  // Refit whenever the text changes.
  useLayoutEffect(() => fitTextarea(), [value, fitTextarea]);

  // The keyboard opening or closing resizes the page.
  useEffect(() => {
    window.addEventListener("resize", fitTextarea);
    return () => window.removeEventListener("resize", fitTextarea);
  }, [fitTextarea]);

  useEffect(() => {
    if (!autoFocus || textareaDisabled || !window.matchMedia("(pointer: fine)").matches) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, textareaDisabled]);

  const submitValue = useCallback(() => {
    const text = value.trim() || (workspace.hasFiles ? "Analyze the attached files." : "");
    if (
      !text ||
      disabled ||
      (isBusy && !allowSteering) ||
      isPreparing ||
      workspace.busy ||
      getChatMessageLength(text) > maxLength
    ) {
      return;
    }

    stopDictationRef.current?.();
    void onSubmit(text);
  }, [allowSteering, disabled, isBusy, isPreparing, maxLength, onSubmit, value, workspace]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitValue();
    },
    [submitValue],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter that confirms an IME composition is not a send; Safari reports
      // it with isComposing false and keyCode 229.
      if (event.nativeEvent.isComposing || event.keyCode === 229) {
        return;
      }

      // An open / or @ list takes the arrows, Enter, Tab and Escape.
      if (mentions.onKeyDown(event)) return;

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitValue();
      }
    },
    [mentions, submitValue],
  );

  // As in desktop chat apps, Escape stops a streaming reply. An Escape that
  // closed a menu, dialog or the drawer is already handled and stops nothing.
  useEffect(() => {
    if (!isBusy) return;
    const stopOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && !event.isComposing) onStop();
    };
    window.addEventListener("keydown", stopOnEscape);
    return () => window.removeEventListener("keydown", stopOnEscape);
  }, [isBusy, onStop]);

  const form = (
    <form
      className={cn(
        "relative min-w-0 rounded-[22px] border border-border/75 bg-background/96 shadow-[0_8px_30px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.03)] backdrop-blur-2xl transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-foreground/15 focus-within:bg-background focus-within:shadow-[0_12px_38px_rgba(0,0,0,0.085),0_1px_2px_rgba(0,0,0,0.035)] dark:bg-background/92",
        className,
      )}
      data-chat-composer
      onSubmit={handleSubmit}
    >
      {mentions.menu}
      <ComposerWorkspace
        attachSlot={attachSlot}
        disabled={textareaDisabled}
        onState={setWorkspace}
      />
      <label className="sr-only" htmlFor={composerId}>
        Message Ægentica
      </label>
      {/* No maxLength: it would cut a long paste without a word (and counts
          UTF-16 units, not characters); the notice below explains the limit. */}
      <textarea
        aria-describedby={isOverMaxLength ? `${composerId}-length` : undefined}
        aria-invalid={isOverMaxLength || undefined}
        className="min-h-[54px] w-full resize-none bg-transparent px-4 pb-1.5 pt-2.5 text-[16px] leading-6 outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[52px] sm:px-5 md:text-[15px]"
        data-chat-composer-input
        autoCapitalize="sentences"
        autoComplete="off"
        disabled={textareaDisabled}
        enterKeyHint="send"
        id={composerId}
        onBlur={mentions.onBlur}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        {...mentions.inputProps}
        placeholder={
          listening ? "Listening…" : isBusy && allowSteering ? "Add a correction…" : placeholder
        }
        ref={textareaRef}
        rows={1}
        value={value}
      />
      {isOverMaxLength ? (
        <p
          className="flex justify-between gap-3 px-4 text-xs text-destructive sm:px-5"
          id={`${composerId}-length`}
        >
          <span role="alert">
            Messages must be {maxLength.toLocaleString()} characters or fewer.
          </span>
          <span className="shrink-0 tabular-nums">
            {messageLength.toLocaleString()} / {maxLength.toLocaleString()}
          </span>
        </p>
      ) : null}
      {dictationError ? (
        <p className="px-4 text-xs text-destructive sm:px-5" role="alert">
          {dictationError}
        </p>
      ) : null}
      <div className="flex min-h-11 items-center justify-between gap-2 px-3 pb-2.5 pt-0.5 sm:gap-3 sm:px-4">
        <div className="-ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <span className="contents" ref={setAttachSlot} />
          {footerStart ?? <span className="block h-8" />}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {dictationSupported ? (
            <Button
              aria-label={conversation ? "End voice conversation" : "Start voice conversation"}
              aria-pressed={conversation}
              className={cn(
                "size-11 rounded-full pointer-fine:md:size-9 text-muted-foreground",
                conversation &&
                  "bg-foreground text-background hover:bg-foreground/85 hover:text-background",
              )}
              disabled={disabled}
              onClick={toggleConversation}
              size="icon-xs"
              title={
                conversation ? "End voice conversation" : "Voice conversation: talk, listen, repeat"
              }
              type="button"
              variant="ghost"
            >
              <AudioLinesIcon
                className={cn("size-4", conversation && listening && "animate-pulse")}
              />
            </Button>
          ) : null}
          {dictationSupported && !conversation && !isBusy && !isPreparing ? (
            <Button
              aria-label={listening ? "Stop dictation" : "Dictate"}
              aria-pressed={listening}
              className={cn(
                "size-11 rounded-full pointer-fine:md:size-9 text-muted-foreground",
                listening && "bg-destructive/10 text-destructive hover:bg-destructive/15",
              )}
              disabled={disabled}
              onClick={toggleDictation}
              size="icon-xs"
              title={dictationError || (listening ? "Stop dictation" : "Dictate")}
              type="button"
              variant="ghost"
            >
              <MicIcon className={cn("size-4", listening && "animate-pulse")} />
            </Button>
          ) : null}
          {isBusy ? (
            <>
              {allowSteering &&
              !workspace.busy &&
              (workspace.hasFiles || trimmedValue.length > 0) &&
              !isOverMaxLength ? (
                <Button
                  aria-label="Steer current turn"
                  className="size-11 rounded-full bg-foreground text-background shadow-sm transition-transform hover:scale-[1.03] hover:bg-foreground/90 active:scale-[0.97] pointer-fine:md:size-9"
                  size="icon-xs"
                  title="Send this as a correction to the active turn"
                  type="submit"
                >
                  <ArrowUpIcon className="size-4" />
                </Button>
              ) : null}
              <Button
                aria-keyshortcuts="Escape"
                aria-label="Stop response"
                className="size-11 rounded-full bg-foreground text-background shadow-none hover:bg-foreground/85 pointer-fine:md:size-9"
                onClick={onStop}
                size="icon-sm"
                title="Stop (Esc)"
                type="button"
              >
                <SquareIcon className="size-3 fill-current" />
              </Button>
            </>
          ) : isPreparing ? (
            <Button
              aria-label="Preparing chat"
              className="size-11 rounded-full pointer-fine:md:size-9 bg-foreground/75 text-background"
              disabled
              size="icon-xs"
              type="button"
            >
              <Loader2Icon className="size-3 animate-spin" />
            </Button>
          ) : (
            <Button
              aria-label="Send message"
              className="size-11 cursor-pointer pointer-fine:md:size-9 rounded-full bg-foreground text-background shadow-sm transition-transform hover:scale-[1.03] hover:bg-foreground/90 active:scale-[0.97] disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-25"
              disabled={
                disabled ||
                workspace.busy ||
                (!workspace.hasFiles && trimmedValue.length === 0) ||
                isOverMaxLength
              }
              size="icon-xs"
              type="submit"
            >
              <ArrowUpIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );

  if (!disabledReason || (!disabled && (!isBusy || allowSteering) && !isPreparing)) {
    return form;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div aria-label={disabledReason} className="min-w-0" tabIndex={0}>
          {form}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">{disabledReason}</TooltipContent>
    </Tooltip>
  );
}
