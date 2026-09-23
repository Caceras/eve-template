"use client";

import { ArrowRightIcon, EllipsisIcon, PanelLeftIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { COMMAND_EVENT, primaryWorkspacePages, systemWorkspacePages } from "@/lib/navigation";
import { SearchIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AuthDisplayLoggedIn, AuthDisplayLoggedOut } from "@/components/auth/auth-display";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
import { SheetClose } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatListItem, SetupStatus, Viewer } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

const activeRowClass = "bg-foreground/[0.055] text-foreground hover:bg-foreground/[0.075]";
const inactiveRowClass = "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground";

export function ChatSidebar({
  activeChatId,
  className,
  chats,
  closeNavigationLinks = false,
  hasMoreChats = false,
  isLoadingChats = false,
  isLoadingMore = false,
  onDeleteChat,
  onLoadMoreChats,
  onNavigate,
  onNewChat,
  onSignIn,
  onToggleSidebar,
  setupStatus,
  viewer,
}: {
  readonly activeChatId: string | null;
  readonly className?: string;
  readonly chats: readonly ChatListItem[];
  readonly closeNavigationLinks?: boolean;
  readonly hasMoreChats?: boolean;
  readonly isLoadingChats?: boolean;
  readonly isLoadingMore?: boolean;
  readonly onDeleteChat: (chatId: string) => void | Promise<void>;
  readonly onLoadMoreChats?: () => void | Promise<void>;
  readonly onNavigate?: (chatId?: string | null) => void;
  readonly onNewChat: () => void;
  readonly onSignIn?: () => void;
  readonly onToggleSidebar?: () => void;
  readonly setupStatus: SetupStatus;
  readonly viewer: Viewer | null;
}) {
  const authDisabled = !setupStatus.appReady;
  const router = useRouter();
  const pathname = usePathname();
  const newSessionActive = activeChatId === null && pathname === "/";
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [deleteChat, setDeleteChat] = useState<ChatListItem | null>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;

    if (!sentinel || !hasMoreChats || !onLoadMoreChats) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isLoadingMore) {
          void onLoadMoreChats();
        }
      },
      { threshold: 0.1 },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [hasMoreChats, isLoadingMore, onLoadMoreChats]);

  return (
    <aside
      className={cn(
        "flex h-full w-64 shrink-0 flex-col border-r border-border/70 bg-background",
        className,
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-1 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="sticky top-0 z-10 mb-2 flex h-10 items-center justify-between bg-background/95 px-2 backdrop-blur">
          <Link
            href="/"
            onClick={() => onNavigate?.(null)}
            className="flex items-center gap-2 text-sm font-medium"
          >
            <img alt="" aria-hidden className="size-5 invert dark:invert-0" src="/aegentica.svg" />
            Ægentica
          </Link>
          {onToggleSidebar && (
            <Button
              aria-label="Close sidebar"
              className="size-10 text-muted-foreground"
              onClick={onToggleSidebar}
              size="icon"
              variant="ghost"
            >
              <PanelLeftIcon className="size-4" />
            </Button>
          )}
          </div>
          <Button
            aria-current={newSessionActive ? "page" : undefined}
            className={cn(
              "min-h-11 w-full justify-start gap-2 rounded-lg px-2 text-sm font-normal md:min-h-9",
              newSessionActive ? activeRowClass : inactiveRowClass,
            )}
            onClick={() => {
              router.push("/");
              onNewChat();
              onNavigate?.(null);
            }}
            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-4" />
            New chat
          </Button>
          <Button
            className="min-h-11 w-full justify-start gap-2 rounded-lg px-2 text-sm font-normal text-muted-foreground hover:bg-muted/50 hover:text-foreground md:min-h-9"
            onClick={() => {
              onNavigate?.();
              window.dispatchEvent(new Event(COMMAND_EVENT));
            }}
            type="button"
            variant="ghost"
          >
            <SearchIcon className="size-4" />
            Search
            <span className="ml-auto hidden rounded border border-border/70 px-1.5 py-0.5 text-[10px] leading-none opacity-60 md:inline-flex">
              Ctrl/⌘ K
            </span>
          </Button>
        <nav aria-label="Workspace" className="mt-3 grid gap-0.5">
          <p className="px-2 pb-1 pt-1 text-[11px] font-medium text-muted-foreground/60">
            Workspace
          </p>
          {primaryWorkspacePages.map(({ href, label, icon: Icon }) => {
            const link = (
              <Link
                href={href}
                onClick={() => onNavigate?.()}
                aria-current={pathname === href ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm md:min-h-9",
                  pathname === href ? activeRowClass : inactiveRowClass,
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );

            return closeNavigationLinks ? (
              <SheetClose asChild key={href}>
                {link}
              </SheetClose>
            ) : (
              <div key={href}>{link}</div>
            );
          })}
          <p className="px-2 pb-1 pt-3 text-[11px] font-medium text-muted-foreground/60">
            More
          </p>
          {systemWorkspacePages.map(({ href, label, icon: Icon }) => {
            const link = (
              <Link
                href={href}
                onClick={() => onNavigate?.()}
                aria-current={pathname === href ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm md:min-h-9",
                  pathname === href ? activeRowClass : inactiveRowClass,
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            );

            return closeNavigationLinks ? (
              <SheetClose asChild key={href}>
                {link}
              </SheetClose>
            ) : (
              <div key={href}>{link}</div>
            );
          })}
        </nav>
        </div>

      <div className="px-2 py-2">
        {chats.length ? (
          <div>
            <p className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-muted-foreground/60">
              Recent
            </p>
            {chats.map((chat) => {
              const active = activeChatId === chat.id;

              return (
                <div
                  className={cn(
                    "group/session relative mb-0.5 rounded-md transition-colors hover:bg-muted/50 hover:text-foreground",
                    active ? activeRowClass : inactiveRowClass,
                  )}
                  key={chat.id}
                >
                  <Link
                    className="flex h-11 min-w-0 items-center px-2 pr-8 text-sm md:h-8"
                    aria-current={active ? "page" : undefined}
                    href={`/chat/${chat.id}`}
                    onClick={() => {
                      onNavigate?.(chat.id);
                    }}
                  >
                    <span className="block truncate">{chat.title}</span>
                    <span className="sr-only">Updated {formatHistoryTime(chat.updatedAt)}</span>
                  </Link>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        aria-label="Chat actions"
                        className="absolute top-1/2 right-0.5 size-10 -translate-y-1/2 opacity-100 transition-opacity hover:bg-muted md:right-1 md:size-7 md:opacity-0 group-hover/session:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                        size="icon-xs"
                        type="button"
                        variant="ghost"
                      >
                        <EllipsisIcon className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={6}>
                      <DropdownMenuItem
                        onSelect={() => setDeleteChat(chat)}
                        variant="destructive"
                      >
                        <Trash2Icon className="size-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </div>
        ) : null}
        {hasMoreChats ? (
          <div ref={sentinelRef} className="px-2 py-2">
            {isLoadingMore ? (
              <p className="text-xs text-muted-foreground">Loading more...</p>
            ) : (
              <Button
                className="h-10 px-2 text-xs font-normal text-muted-foreground hover:text-foreground md:h-8"
                onClick={() => void onLoadMoreChats?.()}
                type="button"
                variant="ghost"
              >
                Load more
              </Button>
            )}
          </div>
        ) : null}
      </div>
      </div>

      <div className="border-t border-border/70 px-2 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {viewer ? (
          <UserMenu authMode={setupStatus.authMode} viewer={viewer} />
        ) : isLoadingChats ? (
          <>
            <AuthDisplayLoggedIn>
              <div className="h-8 rounded-md bg-muted/25" />
            </AuthDisplayLoggedIn>
            <AuthDisplayLoggedOut>
              <SidebarSignInButton
                authDisabled={false}
                onNavigate={onNavigate}
                onSignIn={onSignIn}
              />
            </AuthDisplayLoggedOut>
          </>
        ) : (
          <SidebarSignInButton
            authDisabled={authDisabled}
            onNavigate={onNavigate}
            onSignIn={onSignIn}
          />
        )}
      </div>

      <AlertDialog
        open={Boolean(deleteChat)}
        onOpenChange={(open) => {
          if (!open) setDeleteChat(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete conversation?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteChat
                ? `“${deleteChat.title}” will be removed from your chat history. This cannot be undone.`
                : "This conversation will be removed. This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 md:h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 md:h-9"
              variant="destructive"
              onClick={() => {
                if (!deleteChat) return;
                void onDeleteChat(deleteChat.id);
                setDeleteChat(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}

function SidebarSignInButton({
  authDisabled,
  onNavigate,
  onSignIn,
}: {
  readonly authDisabled: boolean;
  readonly onNavigate?: (chatId?: string | null) => void;
  readonly onSignIn?: () => void;
}) {
  return (
    <Button
      className="h-11 w-full justify-between rounded-md px-2 text-sm font-normal text-muted-foreground hover:bg-muted/50 hover:text-foreground md:h-8"
      disabled={authDisabled}
      onClick={() => {
        onSignIn?.();
        onNavigate?.();
      }}
      type="button"
      variant="ghost"
    >
      <span className="min-w-0">Sign in</span>
      <ArrowRightIcon className="size-3.5" />
    </Button>
  );
}

function formatHistoryTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
