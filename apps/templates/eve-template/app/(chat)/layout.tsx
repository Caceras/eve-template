import { connection } from "next/server";
import { Suspense, type ReactNode } from "react";
import { AgentChatBootstrapSync } from "@/app/_components/agent-chat-bootstrap-sync";
import { AgentChatShell } from "@/app/_components/agent-chat-shell";
import { AgentChatSkeleton } from "@/app/_components/agent-chat-skeleton";
import { CommandMenu } from "@/app/_components/command-menu";
import { listChatsPageByUser } from "@/lib/db/queries";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export default function ChatLayout({ children }: { readonly children: ReactNode }) {
  return (
    <Suspense fallback={<AgentChatSkeleton mode="new" />}>
      <ResolvedChatShell>{children}</ResolvedChatShell>
    </Suspense>
  );
}

async function ResolvedChatShell({ children }: { readonly children: ReactNode }) {
  // Dokploy injects credentials at runtime, not while the Docker image is built.
  await connection();
  const setupStatus = await getSetupStatus();
  const viewer = await getServerViewer(setupStatus);
  const initialChatsPage =
    viewer && setupStatus.appReady && setupStatus.storageMode === "database"
      ? await listChatsPageByUser(viewer.id)
      : { items: [], nextCursor: null };

  return (
    <AgentChatShell
      initialChats={initialChatsPage.items}
      initialNextCursor={initialChatsPage.nextCursor}
      setupStatus={setupStatus}
      viewer={viewer}
    >
      {children}
      <CommandMenu />
      <AgentChatBootstrapSync
        chats={initialChatsPage.items}
        nextCursor={initialChatsPage.nextCursor}
        setupStatus={setupStatus}
        viewer={viewer}
      />
    </AgentChatShell>
  );
}
