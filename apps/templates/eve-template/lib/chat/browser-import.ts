"use client";

import { importBrowserChatAction } from "@/app/actions/chat";
import { deleteLocalChat, getLocalChat, listLocalChats } from "@/lib/chat/local-store";

let running: Promise<number> | undefined;

/**
 * Moves chats saved in this browser (before server history existed) to the
 * server, oldest first so the list keeps its order. Each chat is removed
 * locally only after the server confirms it; failures stay for the next load.
 */
export function importBrowserChats() {
  running ??= (async () => {
    let imported = 0;
    for (const item of [...listLocalChats()].reverse()) {
      const chat = getLocalChat(item.id);
      if (!chat) continue;
      try {
        if (chat.events.length > 0)
          await importBrowserChatAction({
            title: chat.title,
            events: chat.events,
            session: chat.session,
          });
        deleteLocalChat(item.id);
        imported += chat.events.length > 0 ? 1 : 0;
      } catch {
        // Too large for one request or offline: keep it locally and retry later.
      }
    }
    return imported;
  })();
  return running;
}
