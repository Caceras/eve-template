"use client";

import { useParams } from "next/navigation";
import { useSyncExternalStore } from "react";
import { StaticComposer } from "@/app/_components/agent-chat-skeleton";
import {
  ConversationFrame,
  ComposerDock,
  ThinkingLine,
  UserBubble,
} from "@/components/chat/pending-turn";
import { readPendingChatMessage } from "@/lib/chat/provisional-chat";

const subscribeNever = () => () => {};

/**
 * Shown while a chat route loads: the same frame the chat page draws first,
 * with the message that opened a new chat already in place, so the move
 * from the home page never passes through a blank screen.
 */
export default function LoadingChat() {
  const { id } = useParams<{ id: string }>();
  const pending = useSyncExternalStore(
    subscribeNever,
    () => (id ? readPendingChatMessage(id) : null),
    () => null,
  );
  return (
    <div aria-busy="true" className="flex min-h-0 flex-1 flex-col">
      <ConversationFrame>
        {pending ? (
          <>
            <UserBubble text={pending} />
            <ThinkingLine />
          </>
        ) : null}
      </ConversationFrame>
      <ComposerDock>
        <StaticComposer />
      </ComposerDock>
    </div>
  );
}
