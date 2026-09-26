import {
  ArrowUpIcon,
  AudioLinesIcon,
  ChevronDownIcon,
  MenuIcon,
  MicIcon,
  PaperclipIcon,
  SearchIcon,
} from "lucide-react";
import { HomeGreeting, HomeHint, HomeStage } from "@/app/_components/home-chat-page";
import { SidebarFallback } from "@/components/chat/sidebar";
import { MODEL_LABEL_SCRIPT } from "@/lib/chat/model-label";

// The first paint of every hard load: the shell streams in right after, so
// this mirrors it control for control, and a refresh looks like nothing
// happened. The root layout marks <html data-boot-route> before paint, so
// the home page and a chat get their own content and other pages stay blank.
export function AgentChatSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading"
      className="fixed inset-0 flex overflow-hidden bg-background text-foreground"
      role="status"
    >
      <div className="hidden w-64 shrink-0 overflow-hidden md:block" data-desktop-sidebar>
        <SidebarFallback />
      </div>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between bg-gradient-to-b from-background via-background/90 to-transparent px-2 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-3">
          <div className="flex items-center gap-1 text-foreground md:hidden">
            <span className="flex size-10 items-center justify-center">
              <MenuIcon className="size-4" />
            </span>
            <span className="flex size-10 items-center justify-center">
              <SearchIcon className="size-4" />
            </span>
          </div>
        </div>

        <div className="hidden min-h-0 flex-1 flex-col in-data-[boot-route=home]:flex">
          <HomeSkeleton />
        </div>
        <div className="hidden min-h-0 flex-1 flex-col in-data-[boot-route=chat]:flex">
          <ConversationSkeleton />
        </div>
      </main>
    </div>
  );
}

function HomeSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-14 md:pt-8 [@media(max-height:520px)]:pt-12">
      <HomeStage>
        <HomeGreeting />
        <div className="shrink-0 px-4 sm:px-0">
          <StaticComposer />
        </div>
        <HomeHint />
      </HomeStage>
    </div>
  );
}

function ConversationSkeleton() {
  return (
    <>
      <div className="h-12 shrink-0" />
      <div className="min-h-0 flex-1 overflow-hidden px-4 py-6 sm:px-6">
        <div className="mx-auto flex w-full max-w-2xl animate-pulse flex-col gap-8">
          <div className="ml-auto h-10 w-48 max-w-[60vw] rounded-2xl bg-muted/50" />
          <div className="space-y-3">
            <div className="h-4 w-[28rem] max-w-[80vw] rounded-md bg-muted/45" />
            <div className="h-4 w-80 max-w-[70vw] rounded-md bg-muted/35" />
            <div className="h-4 w-64 max-w-[56vw] rounded-md bg-muted/30" />
          </div>
        </div>
      </div>
      <div className="shrink-0 pb-[max(0.85rem,env(safe-area-inset-bottom))] pt-4 sm:pb-5 sm:pt-4">
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
          <StaticComposer />
        </div>
      </div>
    </>
  );
}

/** A still copy of ChatComposer with the same boxes, so nothing moves when it hydrates. */
export function StaticComposer({ className = "" }: { readonly className?: string }) {
  return (
    <div
      className={`min-w-0 rounded-[22px] border border-border/75 bg-background/96 shadow-[0_8px_30px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.03)] dark:bg-background/92 ${className}`}
      data-chat-composer
    >
      <textarea
        aria-hidden
        className="min-h-[54px] w-full resize-none bg-transparent px-4 pb-1.5 pt-2.5 text-[16px] leading-6 outline-none placeholder:text-muted-foreground sm:min-h-[52px] sm:px-5 md:text-[15px]"
        placeholder="Message Ægentica"
        readOnly
        rows={1}
        tabIndex={-1}
      />
      <div className="flex min-h-11 items-center justify-between gap-2 px-3 pb-2.5 pt-0.5 sm:gap-3 sm:px-4">
        <div className="-ml-1 flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          <span className="inline-flex size-11 shrink-0 items-center justify-center text-muted-foreground pointer-fine:md:size-9">
            <PaperclipIcon className="size-4" />
          </span>
          <span className="inline-flex min-h-11 min-w-0 items-center gap-1.5 px-3 text-xs font-medium text-muted-foreground sm:text-sm pointer-fine:md:min-h-9">
            <span className="brand-icon size-3.5" data-model-brand hidden />
            <span className="truncate" data-model-label />
            <script dangerouslySetInnerHTML={{ __html: MODEL_LABEL_SCRIPT }} />
            <span className="hidden shrink-0 text-xs sm:inline" data-model-provider />
            <ChevronDownIcon className="size-3.5 shrink-0" />
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
          <span className="inline-flex size-11 items-center justify-center pointer-fine:md:size-9">
            <AudioLinesIcon className="size-4" />
          </span>
          <span className="inline-flex size-11 items-center justify-center pointer-fine:md:size-9">
            <MicIcon className="size-4" />
          </span>
          <span className="inline-flex size-11 items-center justify-center rounded-full bg-foreground text-background opacity-25 pointer-fine:md:size-9">
            <ArrowUpIcon className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}
