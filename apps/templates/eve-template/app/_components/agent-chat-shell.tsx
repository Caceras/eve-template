"use client";

import {
  CheckIcon,
  MenuIcon,
  PanelLeftIcon,
  SearchIcon,
  SquarePenIcon,
  UploadIcon,
  WifiOffIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  CHAT_BOOTSTRAP_SYNC_EVENT,
  type ChatBootstrapSyncDetail,
} from "@/app/_components/agent-chat-events";
import {
  ChatShellProvider,
  useChatShell,
  type EnabledConnections,
} from "@/app/_components/chat-shell-context";
import { AuthDisplayLoggedOut } from "@/components/auth/auth-display";
import { SignInModal } from "@/components/auth/sign-in-modal";
import { MobileDrawer } from "@/components/chat/mobile-drawer";
import { ChatSidebar } from "@/components/chat/sidebar";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  parseSidebarOpen,
  serializeSidebarOpen,
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
} from "@/lib/chat/sidebar-state";
import { importBrowserChats } from "@/lib/chat/browser-import";
import {
  deleteClientChat,
  listClientChats,
  listClientChatsPage,
  renameClientChat,
} from "@/lib/chat/persistence-client";
import { isProvisionalChatId } from "@/lib/chat/provisional-chat";
import { normalizeChatTitle } from "@/lib/chat/rename";
import type { ModelLabel } from "@/lib/chat/model-label";
import type { ChatListItem, SetupStatus, Viewer } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { COMMAND_EVENT } from "@/lib/navigation";
import { navigateFromLayer } from "@/lib/pwa/back-layer";
import { ariaShortcut, isShortcutModifier, useShortcutModifier } from "@/lib/pwa/shortcuts";
import { prefersShareSheet, shareOrCopy } from "@/lib/pwa/share";

export function AgentChatShell({
  children,
  initialChats,
  initialNextCursor,
  modelLabel,
  setupStatus,
  viewer,
}: {
  readonly children: ReactNode;
  readonly initialChats: readonly ChatListItem[];
  readonly initialNextCursor: string | null;
  readonly modelLabel: ModelLabel | null;
  readonly setupStatus: SetupStatus;
  readonly viewer: Viewer | null;
}) {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [history, setHistory] = useState<ChatListItem[]>([...initialChats]);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [draftBeforeSignIn, setDraftBeforeSignIn] = useState("");
  const [signInCallbackPath, setSignInCallbackPath] = useState("/");
  const [viewerState, setViewerState] = useState(viewer);
  const [setupStatusState, setSetupStatusState] = useState(setupStatus);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [enabledConnections, setEnabledConnections] = useState<EnabledConnections>(() =>
    enabledConnectionsFromSetup(setupStatus),
  );
  const cursorRef = useRef(initialNextCursor);
  const activeChatIdRef = useRef(activeChatId);
  const setupReady = setupStatusState.appReady;
  const router = useRouter();
  const surfaceRef = useRef<HTMLDivElement>(null);
  const desktopSidebarRef = useRef<HTMLDivElement>(null);
  const openSidebarButtonRef = useRef<HTMLButtonElement>(null);
  const focusAfterSidebarToggle = useRef<"open-button" | "sidebar" | null>(null);
  const shortcutModifier = useShortcutModifier();

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  // A tapped notification opens its chat here when the service worker cannot
  // navigate this window itself (it does not control it, e.g. after a hard reload).
  useEffect(() => {
    const open = (event: MessageEvent) => {
      const url: unknown = event.data?.type === OPEN_MESSAGE ? event.data.url : null;
      if (typeof url === "string" && url.startsWith("/") && !url.startsWith("//"))
        navigateFromLayer(router, url);
    };
    navigator.serviceWorker?.addEventListener("message", open);
    navigator.serviceWorker?.startMessages();
    return () => navigator.serviceWorker?.removeEventListener("message", open);
  }, [router]);

  useEffect(() => {
    cursorRef.current = nextCursor;
  }, [nextCursor]);

  useLayoutEffect(() => {
    const saved = readSidebarCookie();

    if (saved !== null) {
      setDesktopSidebarOpen(saved);
      setSidebarDocumentHint(saved);
    }
  }, []);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const close = () => {
      if (desktop.matches) setMobileSidebarOpen(false);
    };
    desktop.addEventListener("change", close);
    return () => desktop.removeEventListener("change", close);
  }, []);

  const [pageSignIns, setPageSignIns] = useState(0);
  const claimPageSignIn = useCallback(() => {
    setPageSignIns((count) => count + 1);
    return () => setPageSignIns((count) => count - 1);
  }, []);

  const requestSignIn = useCallback((draft?: string) => {
    setDraftBeforeSignIn(draft?.trim() ?? "");
    setSignInCallbackPath(window.location.pathname || "/");
    setAuthDialogOpen(true);
  }, []);

  const setDesktopSidebarOpenPersisted = useCallback((open: boolean) => {
    // Focus inside what disappears (the collapsed sidebar turns inert, the top
    // bar's Open sidebar button unmounts) moves to the control that brings it back.
    const active = document.activeElement;
    const leaving = open ? openSidebarButtonRef.current : desktopSidebarRef.current;
    focusAfterSidebarToggle.current = leaving?.contains(active)
      ? open
        ? "sidebar"
        : "open-button"
      : null;
    setDesktopSidebarOpen(open);
    setSidebarDocumentHint(open);
    document.cookie = `${SIDEBAR_COOKIE_NAME}=${serializeSidebarOpen(open)}; Path=/; Max-Age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;
  }, []);

  useEffect(() => {
    const target = focusAfterSidebarToggle.current;
    focusAfterSidebarToggle.current = null;
    if (target === "open-button") openSidebarButtonRef.current?.focus({ preventScroll: true });
    else if (target === "sidebar")
      desktopSidebarRef.current
        ?.querySelector<HTMLElement>("[data-sidebar-toggle]")
        ?.focus({ preventScroll: true });
  }, [desktopSidebarOpen]);

  const setConnectionEnabled = useCallback(
    (connection: keyof EnabledConnections, enabled: boolean) => {
      setEnabledConnections((current) => ({
        ...current,
        [connection]: enabled,
      }));
    },
    [],
  );

  const touchChat = useCallback((chat: ChatListItem) => {
    setHistory((items) => {
      const current = items.find((item) => item.id === chat.id);

      return [
        {
          id: chat.id,
          title: chat.title || current?.title || "New chat",
          updatedAt: chat.updatedAt,
        },
        ...items.filter((item) => item.id !== chat.id),
      ];
    });
  }, []);

  const updateChatTitle = useCallback((chatId: string, title: string) => {
    setHistory((items) => items.map((item) => (item.id === chatId ? { ...item, title } : item)));
  }, []);

  const removeChat = useCallback((chatId: string) => {
    setHistory((items) => items.filter((item) => item.id !== chatId));
  }, []);

  const startNewChat = useCallback(() => {
    activeChatIdRef.current = null;
    setActiveChatId(null);
    navigateFromLayer(router, "/");
    setMobileSidebarOpen(false);
  }, [router]);

  // Desktop shortcuts, as in native chat apps: ⌘ (Ctrl off Apple devices)
  // +Shift+O starts a chat, +B shows or hides the sidebar, +, opens Settings
  // (the Mac convention for preferences).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!isShortcutModifier(event)) return;
      const key = event.key.toLowerCase();
      if (event.shiftKey && key === "o") {
        event.preventDefault();
        startNewChat();
      } else if (!event.shiftKey && key === "b" && matchMedia("(min-width: 768px)").matches) {
        event.preventDefault();
        setDesktopSidebarOpenPersisted(!desktopSidebarOpen);
      } else if (!event.shiftKey && key === ",") {
        event.preventDefault();
        router.push("/settings");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [desktopSidebarOpen, router, setDesktopSidebarOpenPersisted, startNewChat]);

  const handleSidebarNavigate = useCallback((chatId?: string | null) => {
    setMobileSidebarOpen(false);

    if (chatId !== undefined) {
      activeChatIdRef.current = chatId;
      setActiveChatId(chatId);
    }
  }, []);

  // A failed delete or rename rejects, so the sidebar's dialog can say so and stay open.
  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      await deleteClientChat(setupStatusState.storageMode, chatId);
      removeChat(chatId);

      if (activeChatIdRef.current === chatId) {
        startNewChat();
      }
    },
    [removeChat, setupStatusState.storageMode, startNewChat],
  );

  const handleRenameChat = useCallback(
    async (chatId: string, title: string) => {
      const previous = history.find((item) => item.id === chatId)?.title;
      const next = normalizeChatTitle(title);
      if (!next || next === previous) return;
      updateChatTitle(chatId, next);
      try {
        updateChatTitle(chatId, await renameClientChat(setupStatusState.storageMode, chatId, next));
      } catch (error) {
        if (previous) updateChatTitle(chatId, previous);
        throw error;
      }
    },
    [history, setupStatusState.storageMode, updateChatTitle],
  );

  const loadMoreChats = useCallback(async () => {
    const cursor = cursorRef.current;

    if (!cursor || loadingMore || setupStatusState.storageMode !== "database") {
      return;
    }

    setLoadingMore(true);

    try {
      const response = await fetch(`/api/chats?cursor=${encodeURIComponent(cursor)}`);

      if (!response.ok) {
        return;
      }

      const data = (await response.json()) as {
        readonly chats?: readonly ChatListItem[];
        readonly nextCursor?: string | null;
      };
      const incoming = data.chats ?? [];

      setHistory((items) => {
        const existing = new Set(items.map((item) => item.id));
        const fresh = incoming.filter((item) => !existing.has(item.id));

        return [...items, ...fresh];
      });
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // Ignore network hiccups; the observer/button can retry.
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, setupStatusState.storageMode]);

  const setBootstrapData = useCallback(
    ({
      chats,
      nextCursor: incomingNextCursor,
      setupStatus: incomingSetupStatus,
      viewer: incomingViewer,
    }: {
      readonly chats: readonly ChatListItem[];
      readonly nextCursor: string | null;
      readonly setupStatus: SetupStatus;
      readonly viewer: Viewer | null;
    }) => {
      setSetupStatusState(incomingSetupStatus);
      setEnabledConnections((current) => reconcileEnabledConnections(current, incomingSetupStatus));
      setViewerState(incomingViewer);
      const usesBrowserStorage = incomingSetupStatus.storageMode === "browser";
      const nextChats =
        incomingViewer && usesBrowserStorage
          ? listClientChats(incomingSetupStatus.storageMode)
          : chats;

      setHistory((items) => (incomingViewer ? mergeChatHistory(nextChats, items) : []));
      setNextCursor(usesBrowserStorage ? null : incomingNextCursor);
      setHistoryLoading(false);
      cursorRef.current = usesBrowserStorage ? null : incomingNextCursor;
    },
    [],
  );

  // Chats saved in this browser before server history existed move to the server once.
  const serverHistory = Boolean(viewerState) && setupStatusState.storageMode === "database";
  useEffect(() => {
    if (!serverHistory || listClientChats("browser").length === 0) return;
    let cancelled = false;
    void importBrowserChats().then(async (count) => {
      if (count === 0 || cancelled) return;
      const response = await fetch("/api/chats", { cache: "no-store" }).catch(() => null);
      if (!response?.ok || cancelled) return;
      const data = (await response.json()) as { chats: ChatListItem[] };
      setHistory((items) => mergeChatHistory(data.chats, items));
    });
    return () => {
      cancelled = true;
    };
  }, [serverHistory]);

  // An installed app stays open for days and has no pull-to-refresh, so the
  // list catches up by itself, as a native app does: when the app returns
  // after a while, when the connection returns, and when a task result
  // arrives as a notification (the service worker says so).
  useEffect(() => {
    if (!serverHistory) return;
    let awayAt = 0;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        const page = await listClientChatsPage("database");
        setHistory((items) => refreshedHistory(page.items, items, activeChatIdRef.current));
        setNextCursor(page.nextCursor);
        cursorRef.current = page.nextCursor;
      } catch {
        // Offline or signed out: the next return tries again.
      } finally {
        refreshing = false;
      }
    };
    const away = () => {
      awayAt ||= Date.now();
    };
    const back = () => {
      if (document.visibilityState !== "visible") return away();
      const wasAway = awayAt && Date.now() - awayAt > RESUME_REFRESH_MS;
      awayAt = 0;
      if (wasAway) void refresh();
    };
    const onRefresh = () => void refresh();
    const onWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === CHATS_CHANGED_MESSAGE) void refresh();
    };
    document.addEventListener("visibilitychange", back);
    window.addEventListener("blur", away);
    window.addEventListener("focus", back);
    window.addEventListener("online", onRefresh);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    // Listeners added with addEventListener wait for this before messages flow.
    navigator.serviceWorker?.startMessages();
    return () => {
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("blur", away);
      window.removeEventListener("focus", back);
      window.removeEventListener("online", onRefresh);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, [serverHistory]);

  useEffect(() => {
    const target = window as Window & {
      __eveChatBootstrapSync?: ChatBootstrapSyncDetail;
    };
    const handleBootstrapSync = (event: Event) => {
      setBootstrapData((event as CustomEvent<ChatBootstrapSyncDetail>).detail);
    };

    window.addEventListener(CHAT_BOOTSTRAP_SYNC_EVENT, handleBootstrapSync);
    if (target.__eveChatBootstrapSync) {
      setBootstrapData(target.__eveChatBootstrapSync);
    }

    return () => {
      window.removeEventListener(CHAT_BOOTSTRAP_SYNC_EVENT, handleBootstrapSync);
    };
  }, [setBootstrapData]);

  const contextValue = useMemo(
    () => ({
      activeChatId,
      claimPageSignIn,
      desktopSidebarOpen,
      enabledConnections,
      modelLabel,
      removeChat,
      requestSignIn,
      setActiveChatId,
      setConnectionEnabled,
      setupStatus: setupStatusState,
      touchChat,
      updateChatTitle,
      viewer: viewerState,
    }),
    [
      activeChatId,
      claimPageSignIn,
      desktopSidebarOpen,
      enabledConnections,
      modelLabel,
      removeChat,
      requestSignIn,
      setConnectionEnabled,
      setupStatusState,
      touchChat,
      updateChatTitle,
      viewerState,
    ],
  );

  const sidebar = (
    <ChatSidebar
      activeChatId={activeChatId}
      chats={history}
      hasMoreChats={Boolean(nextCursor)}
      isLoadingChats={historyLoading}
      isLoadingMore={loadingMore}
      onDeleteChat={handleDeleteChat}
      onRenameChat={handleRenameChat}
      onLoadMoreChats={loadMoreChats}
      onNavigate={handleSidebarNavigate}
      onNewChat={startNewChat}
      onSignIn={() => requestSignIn()}
      onToggleSidebar={() => setDesktopSidebarOpenPersisted(false)}
      setupStatus={setupStatusState}
      viewer={viewerState}
    />
  );
  const loggedOutAuthActions = historyLoading ? (
    <AuthDisplayLoggedOut>
      <AuthTopActions authMode={setupStatusState.authMode} onSignIn={() => requestSignIn()} />
    </AuthDisplayLoggedOut>
  ) : (
    <AuthTopActions authMode={setupStatusState.authMode} onSignIn={() => requestSignIn()} />
  );
  const topRightActions = (
    <div className="pointer-events-auto mt-1 flex min-w-0 items-center justify-end gap-1.5">
      <OfflineStatus />
      <Suspense fallback={null}>
        <ChatRouteShareButton />
      </Suspense>
      {/* One obvious sign-in action: a page with its own Sign in button keeps it. */}
      {viewerState || pageSignIns > 0 ? null : loggedOutAuthActions}
      {viewerState ? (
        <Suspense fallback={null}>
          <NewChatButton
            className={desktopSidebarOpen ? "md:hidden" : undefined}
            hasActiveChat={Boolean(activeChatId)}
            onNewChat={startNewChat}
          />
        </Suspense>
      ) : null}
    </div>
  );

  return (
    <ChatShellProvider value={contextValue}>
      {/* Pinned to the viewport's edges, not sized in dvh: in Chrome's edge-to-edge
          installed-app mode 100dvh can exceed the screen and make the page scroll. */}
      <div
        className="fixed inset-0 flex overflow-hidden bg-background text-foreground"
        ref={surfaceRef}
      >
        {/* The keyboard's first stop leads past the sidebar to the page. A click
            handler, not a #content navigation, which would leave a history entry
            for Back to undo. Hidden, it moves up by its height and its offset, so
            a tall status bar (an installed app drawn edge to edge) never shows
            its bottom edge; it shows for keyboard focus only. */}
        <a
          className="fixed top-(--skip-top) left-2 z-[70] -translate-y-[calc(100%+var(--skip-top)+1rem)] rounded-md border bg-background px-3 py-2 text-sm font-medium shadow-md outline-none [--skip-top:max(0.5rem,env(safe-area-inset-top))] focus-visible:translate-y-0 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          href="#content"
          onClick={(event) => {
            event.preventDefault();
            document.getElementById("content")?.focus();
          }}
        >
          Skip to content
        </a>
        {/* Collapsed, the sidebar leaves the tab order and the accessibility tree. */}
        <div
          aria-hidden={desktopSidebarOpen ? undefined : true}
          data-desktop-sidebar
          className={cn(
            "hidden shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out md:block",
            desktopSidebarOpen ? "w-64" : "w-0",
          )}
          inert={!desktopSidebarOpen}
          ref={desktopSidebarRef}
        >
          {sidebar}
        </div>

        <main
          className="relative flex min-w-0 flex-1 flex-col overflow-hidden pt-[env(safe-area-inset-top)] outline-none"
          id="content"
          inert={mobileSidebarOpen}
          tabIndex={-1}
        >
          <Suspense fallback={null}>
            <ChatRouteHeading chats={history} />
          </Suspense>
          <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between bg-gradient-to-b from-background via-background/90 to-transparent px-2 pb-3 pt-[max(0.5rem,env(safe-area-inset-top))] md:px-3">
            <div className="pointer-events-auto flex items-center gap-1">
              <Button
                aria-label="Open sidebar"
                className="size-10 rounded-full md:hidden"
                onClick={() => setMobileSidebarOpen(true)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <MenuIcon className="size-4" />
              </Button>
              {!desktopSidebarOpen ? (
                <Button
                  aria-keyshortcuts={ariaShortcut(shortcutModifier, "B")}
                  aria-label="Open sidebar"
                  className="hidden size-10 rounded-md md:inline-flex"
                  onClick={() => setDesktopSidebarOpenPersisted(true)}
                  ref={openSidebarButtonRef}
                  size="icon-sm"
                  title={`Open sidebar (${shortcutModifier} B)`}
                  type="button"
                  variant="ghost"
                >
                  <PanelLeftIcon className="size-4" />
                </Button>
              ) : null}
              <Button
                aria-label="Search pages and conversations"
                // The expanded desktop sidebar has its own Search row.
                className={cn(
                  "size-10 rounded-full md:rounded-md",
                  desktopSidebarOpen && "md:hidden",
                )}
                aria-keyshortcuts={ariaShortcut(shortcutModifier, "K")}
                onClick={() => window.dispatchEvent(new Event(COMMAND_EVENT))}
                size="icon-sm"
                title={`Search (${shortcutModifier} K)`}
                type="button"
                variant="ghost"
              >
                <SearchIcon className="size-4" />
              </Button>
            </div>
            {topRightActions}
          </div>

          {children}
        </main>

        <MobileDrawer
          description="Pages and recent conversations"
          onOpenChange={setMobileSidebarOpen}
          open={mobileSidebarOpen}
          surfaceRef={surfaceRef}
          title="Workspace navigation"
        >
          <ChatSidebar
            activeChatId={activeChatId}
            chats={history}
            className="w-full"
            hasMoreChats={Boolean(nextCursor)}
            isLoadingChats={historyLoading}
            isLoadingMore={loadingMore}
            navigatesFromLayer
            onDeleteChat={handleDeleteChat}
            onRenameChat={handleRenameChat}
            onLoadMoreChats={loadMoreChats}
            onNavigate={handleSidebarNavigate}
            onToggleSidebar={() => setMobileSidebarOpen(false)}
            onNewChat={startNewChat}
            onSignIn={() => requestSignIn()}
            setupStatus={setupStatusState}
            viewer={viewerState}
          />
        </MobileDrawer>

        <SignInModal
          authMode={setupStatusState.authMode}
          callbackPath={signInCallbackPath}
          disabled={!setupReady}
          onBeforeSignIn={() => {
            if (draftBeforeSignIn) {
              window.sessionStorage.setItem("eve-chat-draft", draftBeforeSignIn);
            }
          }}
          onOpenChange={setAuthDialogOpen}
          open={authDialogOpen}
        />
      </div>
    </ChatShellProvider>
  );
}

function readSidebarCookie() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${SIDEBAR_COOKIE_NAME}=([^;]*)`));

  if (!match?.[1]) {
    return null;
  }

  return parseSidebarOpen(match[1]);
}

function setSidebarDocumentHint(open: boolean) {
  if (open) {
    delete document.documentElement.dataset.eveChatSidebar;
  } else {
    document.documentElement.dataset.eveChatSidebar = "closed";
  }
}

function NewChatButton({
  className,
  hasActiveChat,
  onNewChat,
}: {
  readonly className?: string;
  readonly hasActiveChat: boolean;
  readonly onNewChat: () => void;
}) {
  const pathname = usePathname();
  const shortcutModifier = useShortcutModifier();

  // The Live session scaffold has its own new-chat control.
  if ((!hasActiveChat && pathname === "/") || pathname.startsWith("/native")) {
    return null;
  }

  return (
    <Button
      aria-keyshortcuts={ariaShortcut(shortcutModifier, "Shift+O")}
      aria-label="New chat"
      className={cn(
        "size-10 rounded-full text-muted-foreground hover:text-foreground pointer-fine:md:size-8",
        className,
      )}
      onClick={onNewChat}
      size="icon-sm"
      title={`New chat (${shortcutModifier} Shift O)`}
      type="button"
      variant="ghost"
    >
      <SquarePenIcon className="size-4" />
    </Button>
  );
}

const subscribeOnline = (change: () => void) => {
  window.addEventListener("online", change);
  window.addEventListener("offline", change);
  return () => {
    window.removeEventListener("online", change);
    window.removeEventListener("offline", change);
  };
};

/** Says so while the device has no connection, instead of failing quietly. */
function OfflineStatus() {
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
  if (online) return null;
  return (
    <span
      className="flex h-8 items-center gap-1.5 rounded-full bg-muted px-3 text-xs text-muted-foreground"
      role="status"
    >
      <WifiOffIcon className="size-3.5" />
      Offline
    </span>
  );
}

/** A chat page shows no title; screen readers still get one to find their place by. */
function ChatRouteHeading({ chats }: { readonly chats: readonly ChatListItem[] }) {
  const pathname = usePathname();

  if (!pathname.startsWith("/chat/")) {
    return null;
  }

  const chat = chats.find((item) => pathname === `/chat/${encodeURIComponent(item.id)}`);
  return <h1 className="sr-only">{chat?.title || "Chat"}</h1>;
}

function ChatRouteShareButton() {
  const pathname = usePathname();
  const { setupStatus } = useChatShell();

  if (!pathname.startsWith("/chat/") || setupStatus.storageMode === "browser") {
    return null;
  }

  return <ShareChatButton />;
}

const subscribeNothing = () => () => {};

function ShareChatButton() {
  // Phones open the share sheet (which also offers Copy); desktops copy in one click.
  const sheet = useSyncExternalStore(subscribeNothing, prefersShareSheet, () => false);
  const [copied, setCopied] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);

  const clearCopyResetTimer = useCallback(() => {
    if (copyResetTimerRef.current === null) {
      return;
    }

    window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = null;
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      const url = window.location.href;
      if (sheet && (await shareOrCopy({ title: document.title, url })) !== "copied") return;
      if (!sheet) await navigator.clipboard.writeText(url);
      clearCopyResetTimer();
      setCopied(true);
      copyResetTimerRef.current = window.setTimeout(() => {
        copyResetTimerRef.current = null;
        setCopied(false);
      }, 1600);
    } catch {
      setCopied(false);
    }
  }, [clearCopyResetTimer, sheet]);

  useEffect(() => clearCopyResetTimer, [clearCopyResetTimer]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={copied ? "Copied chat link" : sheet ? "Share chat link" : "Copy chat link"}
          className="size-10 rounded-full text-muted-foreground hover:text-foreground pointer-fine:md:size-8"
          onClick={handleCopyLink}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {copied ? <CheckIcon className="size-4" /> : <UploadIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {copied ? "Copied" : sheet ? "Share" : "Copy link"}
      </TooltipContent>
    </Tooltip>
  );
}

function AuthTopActions({
  authMode,
  onSignIn,
}: {
  readonly authMode: SetupStatus["authMode"];
  readonly onSignIn: () => void;
}) {
  if (authMode === "local-dev") {
    return null;
  }

  return (
    <Button
      className="h-10 rounded-full px-3.5 text-sm font-medium pointer-fine:md:h-8 pointer-fine:md:rounded-md pointer-fine:md:px-3"
      onClick={onSignIn}
      type="button"
      variant="outline"
    >
      Sign in
    </Button>
  );
}

function enabledConnectionsFromSetup(setupStatus: SetupStatus): EnabledConnections {
  const configured = new Set(setupStatus.configuredConnections ?? []);
  return {
    linear: configured.has("linear"),
    notion: configured.has("notion"),
    sentry: configured.has("sentry"),
  };
}

function reconcileEnabledConnections(
  current: EnabledConnections,
  setupStatus: SetupStatus,
): EnabledConnections {
  const configured = new Set(setupStatus.configuredConnections ?? []);
  return {
    linear: configured.has("linear") && current.linear,
    notion: configured.has("notion") && current.notion,
    sentry: configured.has("sentry") && current.sentry,
  };
}

const RESUME_REFRESH_MS = 15_000;
/** Posted by public/sw.js when a task result arrives. */
const CHATS_CHANGED_MESSAGE = "aegentica:chats-changed";
/** Posted by public/sw.js when a notification for a chat is tapped. */
const OPEN_MESSAGE = "aegentica:open";

/**
 * The server's newest page, in its order (so chats continued elsewhere move
 * up and deleted ones go), plus the open chat and chats still being created,
 * which the server may not list yet.
 */
function refreshedHistory(
  fresh: readonly ChatListItem[],
  current: readonly ChatListItem[],
  activeChatId: string | null,
) {
  const listed = new Set(fresh.map((item) => item.id));
  const pending = current.filter(
    (item) => !listed.has(item.id) && (item.id === activeChatId || isProvisionalChatId(item.id)),
  );
  return [...pending, ...fresh];
}

function mergeChatHistory(incoming: readonly ChatListItem[], current: readonly ChatListItem[]) {
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  const currentIds = new Set(current.map((item) => item.id));
  const freshIncoming = incoming.filter((item) => !currentIds.has(item.id));

  return [...freshIncoming, ...current.map((item) => incomingById.get(item.id) ?? item)];
}
