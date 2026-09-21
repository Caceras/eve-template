"use client";

import { ArrowUpIcon, Loader2Icon, SquareIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getChatMessageLength, MAX_CHAT_MESSAGE_CHARS } from "@/lib/chat/limits";
import { cn } from "@/lib/utils";

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

  useEffect(() => {
    if (!autoFocus || textareaDisabled) {
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
        "min-w-0 rounded-[20px] border border-black/[0.06] bg-white/92 shadow-[0_10px_40px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] backdrop-blur-xl transition-[border-color,box-shadow,background-color] duration-200 focus-within:border-black/[0.10] focus-within:bg-white focus-within:shadow-[0_14px_50px_rgba(0,0,0,0.11),0_1px_2px_rgba(0,0,0,0.04)] dark:border-white/[0.08] dark:bg-white/[0.06] dark:focus-within:border-white/[0.14] dark:focus-within:bg-white/[0.08]",
        className,
      )}
      data-chat-composer
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor={composerId}>
        Message Ægentica
      </label>
      <textarea
        autoFocus={autoFocus}
        className="max-h-40 min-h-[54px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1.5 text-[16px] leading-6 outline-none placeholder:text-muted-foreground/45 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-[58px] sm:px-5 sm:pt-4 md:text-[15px] dark:placeholder:text-muted-foreground/60"
        data-chat-composer-input
        disabled={textareaDisabled}
        id={composerId}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        ref={textareaRef}
        rows={2}
        value={value}
      />
      <div className="flex min-h-11 items-center justify-between gap-2 px-3 pb-2.5 pt-1 sm:gap-3 sm:px-4 sm:pb-3">
        <div className="-ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {footerStart ?? <span className="block h-8" />}
        </div>
        <div className="flex shrink-0 items-center">
          {isBusy ? (
            <Button
              aria-label="Stop response"
              className="size-8 rounded-full bg-foreground text-background shadow-none hover:bg-foreground/85 sm:size-9"
              onClick={onStop}
              size="icon-sm"
              type="button"
            >
              <SquareIcon className="size-3 fill-current" />
            </Button>
          ) : isPreparing ? (
            <Button
              aria-label="Preparing chat"
              className="size-8 rounded-full bg-foreground/75 text-background sm:size-9"
              disabled
              size="icon-xs"
              type="button"
            >
              <Loader2Icon className="size-3 animate-spin" />
            </Button>
          ) : (
            <Button
              aria-label="Send message"
              className="size-8 cursor-pointer rounded-full bg-foreground text-background shadow-sm transition-transform hover:scale-[1.03] hover:bg-foreground/90 active:scale-[0.97] disabled:cursor-not-allowed disabled:pointer-events-auto disabled:opacity-25 sm:size-9"
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
