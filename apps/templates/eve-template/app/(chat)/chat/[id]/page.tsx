import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AgentChatRouteSync } from "@/app/_components/agent-chat-route-sync";
import { SessionChatPage } from "@/app/_components/session-chat-page";
import { isProvisionalChatId } from "@/lib/chat/provisional-chat";
import { chatExistsForUser } from "@/lib/db/queries";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export default async function ChatPage({
  params,
}: {
  readonly params: Promise<{ readonly id: string }>;
}) {
  const { id: chatId } = await params;

  return (
    <SessionChatPage chatId={chatId} key={chatId}>
      <Suspense fallback={null}>
        <ExistingChat chatId={chatId} />
      </Suspense>
    </SessionChatPage>
  );
}

async function ExistingChat({ chatId }: { readonly chatId: string }) {
  if (isProvisionalChatId(chatId)) {
    return <AgentChatRouteSync activeChat={null} chatId={chatId} />;
  }

  const setupStatus = await getSetupStatus();
  const viewer = await getServerViewer(setupStatus);
  const usesDatabase = setupStatus.storageMode === "database";

  // Only whether the chat exists. The page loads the chat itself
  // (/api/chats/:id, as it must when shown again after Back), so the history,
  // photos included as data URLs, is sent once instead of also in this data.
  if (
    viewer &&
    setupStatus.appReady &&
    usesDatabase &&
    !(await chatExistsForUser(chatId, viewer.id))
  ) {
    notFound();
  }

  return <AgentChatRouteSync activeChat={null} chatId={chatId} />;
}
