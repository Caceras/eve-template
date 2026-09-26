import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The shape of a chat page around its first turn, shared by the chat page,
 * the home page while it turns into one, and the route's loading state, so
 * the message a person just sent stays exactly where it is from the moment
 * they press Send until the reply streams.
 */
export function ConversationFrame({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <>
      <div className="h-12 shrink-0" />
      <div className={cn("relative min-h-0 flex-1 overflow-y-hidden", className)}>
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 py-6 sm:px-6">
          {children}
        </div>
      </div>
    </>
  );
}

/** The composer's place at the bottom of a chat, fading the conversation into it. */
export function ComposerDock({ children }: { readonly children: ReactNode }) {
  return (
    <div className="shrink-0 bg-gradient-to-t from-background via-background/96 to-transparent px-0 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-4 sm:pb-5 sm:pt-4">
      <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">{children}</div>
    </div>
  );
}

/** A message from the person, as components/chat/message.tsx draws one. */
export function UserBubble({
  className,
  text,
}: {
  readonly className?: string;
  readonly text: string;
}) {
  return (
    <article aria-label="You" className={cn("group flex w-full min-w-0 justify-end", className)}>
      <div className="min-w-0 max-w-[82%] rounded-[20px] bg-muted/75 px-3.5 py-2 text-[15px] leading-6 text-foreground sm:max-w-[78%]">
        <div className="whitespace-pre-wrap break-words">{text}</div>
      </div>
    </article>
  );
}

/** "Thinking…" while a reply is on its way; folds away when it arrives. */
export function ThinkingLine({
  className,
  isVisible = true,
}: {
  readonly className?: string;
  readonly isVisible?: boolean;
}) {
  return (
    <article
      aria-live={isVisible ? "polite" : "off"}
      className={cn(
        "flex w-full justify-start overflow-hidden transition-[opacity,transform,max-height] duration-200 ease-out",
        isVisible ? "max-h-8 translate-y-0 opacity-100" : "max-h-0 -translate-y-1 opacity-0",
        className,
      )}
      role="status"
    >
      <div className="px-3 text-[15px] font-medium leading-6 text-muted-foreground">
        <span className="shimmer-text">Thinking…</span>
      </div>
    </article>
  );
}
