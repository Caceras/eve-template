"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquareIcon, PlusIcon, AudioLinesIcon, BellIcon } from "lucide-react";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
} from "@/components/ui/command";
import { useChatShell } from "./chat-shell-context";
import { workspacePages } from "@/lib/navigation";
import { MAX_CHAT_PAGE_SIZE as RECENT_CHATS } from "@/lib/chat/paging";
import { listLocalChats } from "@/lib/chat/local-store";
import type { ChatListItem, StorageMode } from "@/lib/chat/types";
import { navigateFromLayer, useBackToClose } from "@/lib/pwa/back-layer";
import { useShortcutModifier } from "@/lib/pwa/shortcuts";

// The 100 most recent conversations in one request (the sidebar pages 20).
async function loadRecentChats(storageMode: StorageMode) {
  if (storageMode === "browser")
    return { items: listLocalChats().slice(0, RECENT_CHATS), more: false };
  const response = await fetch(`/api/chats?limit=${RECENT_CHATS}`, { cache: "no-store" });
  if (!response.ok) throw new Error("Could not load conversations.");
  const data = (await response.json()) as { chats: ChatListItem[]; nextCursor: string | null };
  return { items: data.chats, more: Boolean(data.nextCursor) };
}

// Loaded on demand by command-menu-launcher.tsx, which owns the shortcut and open state.
export function CommandMenu({
  open,
  setOpen,
}: {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}) {
  const router = useRouter();
  const { viewer, setupStatus } = useChatShell();
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [notice, setNotice] = useState("");
  const modifier = useShortcutModifier();
  const shortcuts = [
    [`${modifier} K`, "search"],
    [`${modifier} ⇧ O`, "new chat"],
    [`${modifier} B`, "sidebar"],
    [`${modifier} ,`, "settings"],
    ["Esc", "stops a reply"],
  ] as const;
  useBackToClose(open, () => setOpen(false));
  useEffect(() => {
    if (!viewer) {
      setChats([]);
      return;
    }
    // One request per opening; the list from the last opening shows meanwhile.
    if (!open) return;
    let cancelled = false;
    setNotice("Loading recent conversations...");
    void loadRecentChats(setupStatus.storageMode)
      .then(({ items, more }) => {
        if (cancelled) return;
        setChats(items);
        setNotice(more ? `Showing the ${RECENT_CHATS} most recent conversations.` : "");
      })
      .catch(() => {
        if (!cancelled)
          setNotice("Conversation search is unavailable. Page navigation still works.");
      });
    return () => {
      cancelled = true;
    };
  }, [open, viewer, setupStatus.storageMode]);
  function go(href: string) {
    navigateFromLayer(router, href);
    setOpen(false);
  }
  return (
    <>
      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search your workspace"
        description="Find pages, settings and recent conversations. Use arrow keys and Enter."
      >
        <CommandInput placeholder="Search pages, agents, settings, chats..." />
        <CommandList className="max-h-[65dvh]">
          <CommandEmpty>No results. Try another name or keyword.</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem value="New chat" onSelect={() => go("/")}>
              <PlusIcon className="size-4" />
              New chat
              <CommandShortcut className="hidden pointer-fine:md:inline">
                {modifier} ⇧ O
              </CommandShortcut>
            </CommandItem>
            <CommandItem value="Create agent" onSelect={() => go("/agents?new=1")}>
              <PlusIcon className="size-4" />
              Create agent
            </CommandItem>
          </CommandGroup>
          <CommandGroup heading="Workspace">
            {workspacePages.map(({ href, label, keywords, icon: Icon }) => (
              <CommandItem key={href} value={label} keywords={[keywords]} onSelect={() => go(href)}>
                <Icon className="size-4" />
                {label}
              </CommandItem>
            ))}
            <CommandItem
              value="Voice"
              keywords={["microphone speech language"]}
              onSelect={() => go("/settings/voice")}
            >
              <AudioLinesIcon className="size-4" />
              Voice
            </CommandItem>
            <CommandItem
              value="Notifications and install"
              onSelect={() => go("/settings/notifications")}
            >
              <BellIcon className="size-4" />
              Notifications &amp; install
            </CommandItem>
          </CommandGroup>
          {/* Group headings divide the list; separators would break its listbox semantics. */}
          {chats.length > 0 && (
            <CommandGroup heading="Recent conversations">
              {chats.map((chat) => (
                <CommandItem
                  key={chat.id}
                  value={`chat-${chat.id}`}
                  keywords={[chat.title]}
                  onSelect={() => go(`/chat/${chat.id}`)}
                >
                  <MessageSquareIcon className="size-4 shrink-0" />
                  <span className="truncate">{chat.title}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
        {notice && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground" role="status">
            {notice}
          </p>
        )}
        {/* Desktop keyboard shortcuts, where people look for them. */}
        <p className="hidden flex-wrap gap-x-3 gap-y-1 border-t px-3 py-2 text-[11px] text-muted-foreground pointer-fine:md:flex">
          {shortcuts.map(([keys, action]) => (
            <span key={keys}>
              <kbd className="text-foreground/80">{keys}</kbd> {action}
            </span>
          ))}
        </p>
      </CommandDialog>
    </>
  );
}
