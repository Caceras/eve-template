"use client";

import { ArrowDownIcon } from "lucide-react";
import { useCallback, type ComponentProps } from "react";
import { StickToBottom, useStickToBottomContext } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChatConversation({ className, ...props }: ComponentProps<typeof StickToBottom>) {
  return (
    <StickToBottom
      className={cn("relative min-h-0 flex-1 overflow-y-hidden", className)}
      initial="smooth"
      resize="smooth"
      role="log"
      {...props}
    />
  );
}

export function ChatConversationContent({
  className,
  ...props
}: ComponentProps<typeof StickToBottom.Content>) {
  return (
    <StickToBottom.Content
      className={cn(
        "mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-8 pt-3 sm:gap-6 sm:px-6 sm:pb-10 sm:pt-5",
        className,
      )}
      {...props}
    />
  );
}

export function ChatScrollButton({ className, ...props }: ComponentProps<typeof Button>) {
  const { isAtBottom, scrollToBottom } = useStickToBottomContext();
  const handleScrollToBottom = useCallback(() => scrollToBottom(), [scrollToBottom]);

  if (isAtBottom) {
    return null;
  }

  return (
    <Button
      aria-label="Scroll to latest message"
      className={cn(
        "absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full border-black/[0.06] bg-background/90 shadow-md backdrop-blur-xl",
        className,
      )}
      onClick={handleScrollToBottom}
      size="icon-sm"
      type="button"
      variant="outline"
      {...props}
    >
      <ArrowDownIcon className="size-4" />
    </Button>
  );
}
