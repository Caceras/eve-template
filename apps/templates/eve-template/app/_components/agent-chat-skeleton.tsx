import {
  ArrowUpIcon,
  BlocksIcon,
  HammerIcon,
  ListRestartIcon,
  MenuIcon,
  PanelLeftIcon,
  PlusIcon,
  RadioTowerIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const activeRowClass = "bg-muted/50 text-foreground";
const inactiveRowClass = "text-muted-foreground";

export function AgentChatSkeleton({ mode }: { readonly mode: "chat" | "new" }) {
  const isNew = mode === "new";

  return (
    <div
      aria-busy="true"
      aria-label="Loading chat"
      className="flex h-dvh overflow-hidden bg-background text-foreground"
      role="status"
    >
      <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-border bg-background md:flex">
        <div className="flex flex-col gap-1 px-2 pt-2 pb-2">
          <div className="flex items-center justify-between">
            <div className="flex size-8 items-center justify-center rounded-md">
              <img
                alt=""
                aria-hidden
                className="size-4 select-none invert dark:invert-0"
                draggable={false}
                src="/aegentica.svg"
              />
            </div>
            <div className="flex size-8 items-center justify-center rounded-md text-muted-foreground/55">
              <PanelLeftIcon className="size-4" />
            </div>
          </div>
          <div
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-sm",
              isNew ? activeRowClass : inactiveRowClass,
            )}
          >
            <PlusIcon className="size-4" />
            New session
          </div>
          <div className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground">
            <BlocksIcon className="size-4" />
            Agent
          </div>
          <div className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground">
            <RadioTowerIcon className="size-4" />
            Channels
          </div>
          <div className="flex h-8 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground">
            <ListRestartIcon className="size-4" />
            Sessions
          </div>
        </div>

        <div className="flex-1 space-y-2 overflow-y-hidden px-2 py-2">
          {isNew ? null : (
            <>
              <div className="h-8 rounded-md bg-muted/50" />
              <div className="h-8 rounded-md bg-muted/25" />
              <div className="h-8 rounded-md bg-muted/20" />
            </>
          )}
        </div>

        <div className="border-t border-border px-2 py-3">
          <div className="h-8 rounded-md bg-muted/25" />
        </div>
      </aside>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-2 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-3">
          <div className="pointer-events-auto flex items-center gap-1">
            <div className="flex size-8 items-center justify-center rounded-md text-muted-foreground md:hidden">
              <MenuIcon className="size-4" />
            </div>
          </div>
          <div className="pointer-events-auto flex items-center justify-end gap-1.5">
            <div className="hidden h-8 w-16 rounded-md bg-muted/30 sm:block" />
            <div className="hidden h-8 w-16 rounded-md bg-muted/50 sm:block" />
          </div>
        </div>

        <AgentChatContentSkeleton mode={mode} />
      </main>
    </div>
  );
}

export function AgentChatContentSkeleton({ mode }: { readonly mode: "chat" | "new" }) {
  return mode === "new" ? <EmptyChatSkeleton /> : <ConversationSkeleton />;
}

function EmptyChatSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-14 md:pt-8">
      <div className="flex min-h-0 flex-1 items-center justify-center pb-12 sm:pb-[8vh]">
        <div className="w-full max-w-2xl space-y-6 sm:space-y-7">
          <h1 className="flex justify-center">
            <img
              alt=""
              className="size-12 select-none invert sm:size-14 dark:invert-0"
              draggable={false}
              src="/aegentica.svg"
            />
          </h1>
          <div className="space-y-2 text-center">
            <p className="text-2xl font-medium tracking-tight sm:text-3xl">
              What would you like to work on?
            </p>
            <p className="text-sm text-muted-foreground">
              Bring a question, an idea, or a task. We’ll take it from here.
            </p>
          </div>
          <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
            <StaticComposerFallback />
          </div>
        </div>
      </div>
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <>
      <div className="shrink-0 border-b border-border/70 py-3 pr-16 pl-12 md:pr-28 md:pl-4">
        <div className="h-6 w-48 max-w-[50vw] rounded-md bg-muted/35" />
      </div>
      <div className="flex-1 px-4 py-10 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl animate-pulse flex-col gap-8">
          <div className="space-y-3">
            <div className="h-4 w-36 rounded-md bg-muted/30" />
            <div className="h-5 w-72 max-w-[70vw] rounded-md bg-muted/45" />
          </div>
          <div className="ml-auto h-8 w-20 rounded-md bg-muted/35" />
          <div className="space-y-3">
            <div className="h-4 w-32 rounded-md bg-muted/30" />
            <div className="h-5 w-[28rem] max-w-[78vw] rounded-md bg-muted/45" />
            <div className="h-5 w-80 max-w-[64vw] rounded-md bg-muted/35" />
          </div>
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl shrink-0 px-4 pb-4 sm:px-6 sm:pb-6">
        <StaticComposerFallback />
      </div>
    </>
  );
}

function StaticComposerFallback() {
  return (
    <div
      className="min-w-0 rounded-[24px] border border-black/[0.055] bg-white/94 shadow-[0_12px_44px_rgba(0,0,0,0.075),0_1px_2px_rgba(0,0,0,0.035)] dark:border-white/[0.08] dark:bg-white/[0.065]"
      data-chat-composer
    >
      <div className="min-h-[62px] px-4 pb-2 pt-4 text-[16px] leading-6 text-muted-foreground/45 sm:min-h-[60px] sm:px-5 md:text-[15px] dark:text-muted-foreground/60">
        Message Ægentica
      </div>
      <div className="flex min-h-12 items-center justify-between gap-2 px-3 pb-3 pt-1 sm:px-4">
        <div className="-ml-2 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/80 dark:text-muted-foreground/50">
            <HammerIcon className="size-4 shrink-0" />
          </span>
        </div>
        <div className="flex shrink-0 items-center">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-foreground/55 text-background">
            <ArrowUpIcon className="size-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
