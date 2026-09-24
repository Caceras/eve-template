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
  CommandSeparator,
} from "@/components/ui/command";
import { useChatShell } from "./chat-shell-context";
import { COMMAND_EVENT, workspacePages } from "@/lib/navigation";
import { listClientChatsPage } from "@/lib/chat/persistence-client";
import type { ChatListItem } from "@/lib/chat/types";
export function CommandMenu() {
  const router = useRouter();
  const { viewer, setupStatus } = useChatShell();
  const [open, setOpen] = useState(false);
  const [chats, setChats] = useState<ChatListItem[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const toggle = () => setOpen((value) => !value);
    const key = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", key);
    window.addEventListener(COMMAND_EVENT, toggle);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener(COMMAND_EVENT, toggle);
    };
  }, []);
  useEffect(() => {
    if (!open || !viewer) {
      setChats([]);
      return;
    }
    let cancelled = false;
    setNotice("Loading recent conversations...");
    void (async () => {
      const all: ChatListItem[] = [];
      let cursor: string | null = null;
      try {
        for (let page = 0; page < 5; page++) {
          const result = await listClientChatsPage(setupStatus.storageMode, cursor);
          all.push(...result.items);
          cursor = result.nextCursor;
          if (!cursor || cancelled) break;
        }
        if (!cancelled) {
          setChats([...new Map(all.map((chat) => [chat.id, chat])).values()].slice(0, 100));
          setNotice(cursor ? "Showing the 100 most recent conversations." : "");
        }
      } catch {
        if (!cancelled)
          setNotice("Conversation search is unavailable. Page navigation still works.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, viewer, setupStatus.storageMode]);
  function go(href: string) {
    setOpen(false);
    router.push(href);
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
            </CommandItem>
            <CommandItem value="Create agent" onSelect={() => go("/agents?new=1")}>
              <PlusIcon className="size-4" />
              Create agent
            </CommandItem>
          </CommandGroup>
          <CommandSeparator />
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
          {chats.length > 0 && (
            <>
              <CommandSeparator />
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
            </>
          )}
        </CommandList>
        {notice && (
          <p className="border-t px-3 py-2 text-xs text-muted-foreground" role="status">
            {notice}
          </p>
        )}
      </CommandDialog>
    </>
  );
}
