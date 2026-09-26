"use client";

import {
  ArrowRightIcon,
  EllipsisIcon,
  PanelLeftIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { COMMAND_EVENT, primaryWorkspacePages, systemWorkspacePages } from "@/lib/navigation";
import { SearchIcon } from "lucide-react";
import { markLayerNavigation } from "@/lib/pwa/back-layer";
import { opensAppMenu, tick } from "@/lib/pwa/touch";
import { ariaShortcut, useShortcutModifier } from "@/lib/pwa/shortcuts";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { AuthDisplayLoggedIn, AuthDisplayLoggedOut } from "@/components/auth/auth-display";
import { UserMenu } from "@/components/auth/user-menu";
import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MAX_CHAT_TITLE_LENGTH, normalizeChatTitle } from "@/lib/chat/rename";
import type { ChatListItem, SetupStatus, Viewer } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

const workspaceHrefs: readonly string[] = [...primaryWorkspacePages, ...systemWorkspacePages].map(
  (page) => page.href,
);

/** The most specific workspace page containing the path, so /settings/voice selects Settings. */
function activeWorkspaceHref(pathname: string) {
  return workspaceHrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

const subscribeNothing = () => () => {};

const activeRowClass = "bg-foreground/[0.055] text-foreground hover:bg-foreground/[0.075]";
const inactiveRowClass = "text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground";

export function ChatSidebar({
  activeChatId,
  className,
  chats,
  hasMoreChats = false,
  isLoadingChats = false,
  isLoadingMore = false,
  navigatesFromLayer = false,
  onDeleteChat,
  onRenameChat,
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
  readonly hasMoreChats?: boolean;
  readonly isLoadingChats?: boolean;
  readonly isLoadingMore?: boolean;
  /** Inside the phone drawer, links replace the drawer's back-gesture history entry. */
  readonly navigatesFromLayer?: boolean;
  readonly onDeleteChat: (chatId: string) => void | Promise<void>;
  readonly onRenameChat: (chatId: string, title: string) => void | Promise<void>;
  readonly onLoadMoreChats?: () => void | Promise<void>;
  readonly onNavigate?: (chatId?: string | null) => void;
  readonly onNewChat: () => void;
  readonly onSignIn?: () => void;
  readonly onToggleSidebar?: () => void;
  readonly setupStatus: SetupStatus;
  readonly viewer: Viewer | null;
}) {
  const authDisabled = !setupStatus.appReady;
  const pathname = usePathname();
  const modifier = useShortcutModifier();
  const newSessionActive = activeChatId === null && pathname === "/";
  const activeHref = activeWorkspaceHref(pathname);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  // Times follow the viewer's time zone and locale, which the server cannot know;
  // rendering them only after hydration keeps it from rebuilding the sidebar.
  const hydrated = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const [deleteChat, setDeleteChat] = useState<ChatListItem | null>(null);
  const [renameChat, setRenameChat] = useState<ChatListItem | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  // A rename or delete that fails keeps its dialog open with the reason.
  const [chatActionBusy, setChatActionBusy] = useState(false);
  const [chatActionError, setChatActionError] = useState("");
  const chatActionErrorId = useId();
  const [menuChatId, setMenuChatId] = useState<string | null>(null);
  const navigate = (chatId?: string | null) => {
    if (navigatesFromLayer) markLayerNavigation();
    onNavigate?.(chatId);
  };

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
        "flex h-full w-64 shrink-0 flex-col border-r border-border/70 bg-background select-none",
        className,
      )}
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col gap-1 px-2 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="sticky top-0 z-10 mb-2 flex h-10 items-center justify-between bg-background/95 px-2 backdrop-blur">
            <Link
              href="/"
              onClick={() => navigate(null)}
              replace={navigatesFromLayer}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <img
                alt=""
                aria-hidden
                className="size-5 invert dark:invert-0"
                src="/aegentica.svg"
              />
              Ægentica
            </Link>
            {onToggleSidebar && (
              <Button
                aria-keyshortcuts={navigatesFromLayer ? undefined : ariaShortcut(modifier, "B")}
                aria-label="Close sidebar"
                className="size-10 text-muted-foreground"
                data-sidebar-toggle
                onClick={onToggleSidebar}
                title={navigatesFromLayer ? undefined : `Close sidebar (${modifier} B)`}
                size="icon"
                variant="ghost"
              >
                <PanelLeftIcon className="size-4" />
              </Button>
            )}
          </div>
          <Button
            aria-current={newSessionActive ? "page" : undefined}
            aria-keyshortcuts={ariaShortcut(modifier, "Shift+O")}
            aria-label="New chat"
            className={cn(
              "min-h-11 w-full justify-start gap-2 rounded-lg px-2 text-sm font-normal pointer-fine:md:min-h-9",
              newSessionActive ? activeRowClass : inactiveRowClass,
            )}
            onClick={() => {
              onNewChat();
              onNavigate?.(null);
            }}
            type="button"
            variant="ghost"
          >
            <PlusIcon className="size-4" />
            New chat
            <span className="ml-auto hidden rounded border border-border/70 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground pointer-fine:md:inline-flex">
              {modifier} ⇧ O
            </span>
          </Button>
          <Button
            aria-keyshortcuts={ariaShortcut(modifier, "K")}
            aria-label="Search pages and conversations"
            className="min-h-11 w-full justify-start gap-2 rounded-lg px-2 text-sm font-normal text-muted-foreground hover:bg-muted/50 hover:text-foreground pointer-fine:md:min-h-9"
            onClick={() => {
              onNavigate?.();
              window.dispatchEvent(new Event(COMMAND_EVENT));
            }}
            type="button"
            variant="ghost"
          >
            <SearchIcon className="size-4" />
            Search
            <span className="ml-auto hidden rounded border border-border/70 px-1.5 py-0.5 text-[10px] leading-none text-muted-foreground pointer-fine:md:inline-flex">
              {modifier} K
            </span>
          </Button>
          <nav aria-label="Workspace" className="mt-3 grid gap-0.5">
            <p className="px-2 pb-1 pt-1 text-[11px] font-medium text-muted-foreground">
              Workspace
            </p>
            {primaryWorkspacePages.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => navigate()}
                replace={navigatesFromLayer}
                aria-current={activeHref === href ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm pointer-fine:md:min-h-9",
                  activeHref === href ? activeRowClass : inactiveRowClass,
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            ))}
            <p className="px-2 pb-1 pt-3 text-[11px] font-medium text-muted-foreground">More</p>
            {systemWorkspacePages.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={() => navigate()}
                replace={navigatesFromLayer}
                aria-current={activeHref === href ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2.5 rounded-lg px-2 text-sm pointer-fine:md:min-h-9",
                  activeHref === href ? activeRowClass : inactiveRowClass,
                )}
              >
                <Icon className="size-4 shrink-0" />
                {label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="px-2 py-2">
          {chats.length ? (
            <div>
              <p className="px-2 pb-1.5 pt-1 text-[11px] font-medium text-muted-foreground">
                Recent
              </p>
              {chats.map((chat) => {
                const active = activeChatId === chat.id;

                return (
                  <div
                    className={cn(
                      "group/session relative mb-0.5 rounded-md transition-colors hover:bg-muted/50 hover:text-foreground",
                      active ? activeRowClass : inactiveRowClass,
                      menuChatId === chat.id && "bg-foreground/[0.055] text-foreground",
                    )}
                    key={chat.id}
                    // A long press (or a right click in the installed app) opens
                    // the chat's own menu, as in a native app, instead of the
                    // browser's link menu. The ⋯ button stays the visible path.
                    onContextMenu={(event) => {
                      if (!opensAppMenu()) return;
                      event.preventDefault();
                      tick();
                      setMenuChatId(chat.id);
                    }}
                  >
                    <Link
                      className="flex h-11 min-w-0 items-center px-2 pr-12 text-sm pointer-fine:md:h-8 pointer-fine:md:pr-8"
                      aria-current={active ? "page" : undefined}
                      draggable={false}
                      href={`/chat/${chat.id}`}
                      onClick={() => navigate(chat.id)}
                      replace={navigatesFromLayer}
                    >
                      <span className="block truncate">{chat.title}</span>
                      {hydrated ? (
                        <span className="sr-only">Updated {formatHistoryTime(chat.updatedAt)}</span>
                      ) : null}
                    </Link>
                    <DropdownMenu
                      open={menuChatId === chat.id}
                      onOpenChange={(open) => setMenuChatId(open ? chat.id : null)}
                    >
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label={`Actions for ${chat.title}`}
                          className="absolute top-1/2 right-0.5 size-10 -translate-y-1/2 opacity-100 transition-opacity hover:bg-muted pointer-fine:md:right-1 pointer-fine:md:size-7 pointer-fine:md:opacity-0 group-hover/session:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                          size="icon-xs"
                          type="button"
                          variant="ghost"
                        >
                          <EllipsisIcon className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" sideOffset={6}>
                        <DropdownMenuItem
                          onSelect={() => {
                            setRenameDraft(chat.title);
                            setChatActionError("");
                            setRenameChat(chat);
                          }}
                        >
                          <PencilIcon className="size-4" />
                          Rename
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => {
                            setChatActionError("");
                            setDeleteChat(chat);
                          }}
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
                  className="h-10 px-2 text-xs font-normal text-muted-foreground hover:text-foreground pointer-fine:md:h-8"
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

      <Dialog
        open={Boolean(renameChat)}
        onOpenChange={(open) => {
          if (!open && !chatActionBusy) setRenameChat(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <form
            className="grid gap-4"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!renameChat || !normalizeChatTitle(renameDraft) || chatActionBusy) return;
              setChatActionBusy(true);
              setChatActionError("");
              try {
                await onRenameChat(renameChat.id, renameDraft);
                setRenameChat(null);
              } catch {
                setChatActionError(
                  "Couldn't rename this chat. Check the connection and try again.",
                );
              } finally {
                setChatActionBusy(false);
              }
            }}
          >
            <DialogHeader>
              <DialogTitle>Rename chat</DialogTitle>
              <DialogDescription>The name shown in your history and search.</DialogDescription>
            </DialogHeader>
            <Input
              aria-describedby={chatActionError ? chatActionErrorId : undefined}
              aria-invalid={chatActionError ? true : undefined}
              aria-label="Chat name"
              className="h-11 pointer-fine:md:h-9"
              enterKeyHint="done"
              maxLength={MAX_CHAT_TITLE_LENGTH}
              onChange={(event) => setRenameDraft(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
              value={renameDraft}
            />
            {chatActionError ? (
              <p className="text-sm text-destructive" id={chatActionErrorId} role="alert">
                {chatActionError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                className="h-11 pointer-fine:md:h-9"
                onClick={() => setRenameChat(null)}
                type="button"
                variant="outline"
              >
                Cancel
              </Button>
              <Button
                className="h-11 pointer-fine:md:h-9"
                disabled={!normalizeChatTitle(renameDraft) || chatActionBusy}
                type="submit"
              >
                {chatActionBusy ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteChat)}
        onOpenChange={(open) => {
          if (!open && !chatActionBusy) setDeleteChat(null);
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
          {chatActionError ? (
            <p className="text-sm text-destructive" role="alert">
              {chatActionError}
            </p>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 pointer-fine:md:h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 pointer-fine:md:h-9"
              disabled={chatActionBusy}
              variant="destructive"
              onClick={async (event) => {
                // Stays open until the server confirms, so a failure can say so here.
                event.preventDefault();
                if (!deleteChat || chatActionBusy) return;
                setChatActionBusy(true);
                setChatActionError("");
                try {
                  await onDeleteChat(deleteChat.id);
                  setDeleteChat(null);
                } catch {
                  setChatActionError(
                    "Couldn't delete this chat. Check the connection and try again.",
                  );
                } finally {
                  setChatActionBusy(false);
                }
              }}
            >
              {chatActionBusy ? "Deleting…" : "Delete"}
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
      className="h-11 w-full justify-between rounded-md px-2 text-sm font-normal text-muted-foreground hover:bg-muted/50 hover:text-foreground pointer-fine:md:h-8"
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
