"use client";

import { ArrowUpIcon, AudioLinesIcon, Loader2Icon, MicIcon, SquareIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
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

export function ChatComposer({
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaDisabled = disabled || isBusy || isPreparing;
  const trimmedValue = value.trim();
  const isOverMaxLength = getChatMessageLength(trimmedValue) > maxLength;
  const [dictationSupported, setDictationSupported] = useState(false);
  const [dictationError, setDictationError] = useState("");
  const stopDictationRef = useRef<(() => void) | null>(null);
  const listening = stopDictationRef.current !== null;
  const [, setListeningTick] = useState(0);

  const conversation = useVoiceConversation();
  const latest = useRef({ onSubmit, isBusy, disabled });
  latest.current = { onSubmit, isBusy, disabled };

  useEffect(() => setDictationSupported(canDictate()), []);
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

  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "0px";
    const nextHeight = Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > MAX_TEXTAREA_HEIGHT ? "auto" : "hidden";
  }, [value]);

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
    const text = value.trim();
    if (!text || disabled || isBusy || isPreparing || getChatMessageLength(text) > maxLength) {
      return;
    }

    stopDictationRef.current?.();
    void onSubmit(text);
  }, [disabled, isBusy, isPreparing, maxLength, onSubmit, value]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitValue();
    },
    [submitValue],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.nativeEvent.isComposing) {
        return;
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitValue();
      }
    },
    [submitValue],
  );

  const form = (
    <form
      className={cn(
        "min-w-0 rounded-[24px] border border-black/[0.055] bg-white/94 shadow-[0_12px_44px_rgba(0,0,0,0.075),0_1px_2px_rgba(0,0,0,0.035)] backdrop-blur-2xl transition-[border-color,box-shadow,background-color,transform] duration-200 focus-within:border-black/[0.11] focus-within:bg-white focus-within:shadow-[0_16px_56px_rgba(0,0,0,0.105),0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.08] dark:bg-white/[0.065] dark:focus-within:border-white/[0.14] dark:focus-within:bg-white/[0.09]",
        className,
      )}
      data-chat-composer
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor={composerId}>
        Message Ægentica
      </label>
      <textarea
        className="min-h-[62px] w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[16px] leading-6 outline-none placeholder:text-muted-foreground/45 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[60px] sm:px-5 sm:pt-4 md:text-[15px] dark:placeholder:text-muted-foreground/60"
        data-chat-composer-input
        autoCapitalize="sentences"
        autoComplete="off"
        disabled={textareaDisabled}
        enterKeyHint="send"
        id={composerId}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={listening ? "Listening…" : placeholder}
        ref={textareaRef}
        rows={1}
        value={value}
      />
      {dictationError ? (
        <p className="px-4 text-xs text-destructive sm:px-5" role="alert">
          {dictationError}
        </p>
      ) : null}
      <div className="flex min-h-12 items-center justify-between gap-2 px-3 pb-3 pt-1 sm:gap-3 sm:px-4 sm:pb-3">
        <div className="-ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {footerStart ?? <span className="block h-8" />}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {dictationSupported ? (
            <Button
              aria-label={conversation ? "End voice conversation" : "Start voice conversation"}
              aria-pressed={conversation}
              className={cn(
                "size-9 rounded-full text-muted-foreground",
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
                "size-9 rounded-full text-muted-foreground",
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
            <Button
              aria-label="Stop response"
              className="size-9 rounded-full bg-foreground text-background shadow-none hover:bg-foreground/85"
              onClick={onStop}
              size="icon-sm"
              type="button"
            >
              <SquareIcon className="size-3 fill-current" />
            </Button>
          ) : isPreparing ? (
            <Button
              aria-label="Preparing chat"
              className="size-9 rounded-full bg-foreground/75 text-background"
              disabled
              size="icon-xs"
              type="button"
            >
              <Loader2Icon className="size-3 animate-spin" />
            </Button>
          ) : (
            <Button
              aria-label="Send message"
              className="size-9 cursor-pointer rounded-full bg-foreground text-background shadow-sm transition-transform hover:scale-[1.03] hover:bg-foreground/90 active:scale-[0.97] disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-25"
              disabled={disabled || trimmedValue.length === 0 || isOverMaxLength}
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

  if (!disabledReason || (!disabled && !isBusy && !isPreparing)) {
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
