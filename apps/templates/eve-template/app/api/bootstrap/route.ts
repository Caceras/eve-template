import { connection } from "next/server";
import { NextResponse } from "next/server";
import type { SetupStatus } from "@/lib/chat/types";
import { listChatsPageByUser } from "@/lib/db/queries";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

/** What a signed-out visitor may learn: whether and how to sign in, not the configuration. */
type PublicSetupStatus = Pick<SetupStatus, "appReady" | "authMode" | "authReady">;

export async function GET() {
  await connection();
  const setupStatus = await getSetupStatus();
  const viewer = await getServerViewer(setupStatus);
  if (!viewer) {
    // Nothing about the setup (missing variables, database, connectors, rate limiting).
    const { appReady, authMode, authReady } = setupStatus;
    return NextResponse.json({
      chats: [],
      nextCursor: null,
      setupStatus: { appReady, authMode, authReady } satisfies PublicSetupStatus,
      viewer: null,
    });
  }
  const initialChatsPage =
    setupStatus.appReady && setupStatus.storageMode === "database"
      ? await listChatsPageByUser(viewer.id)
      : { items: [], nextCursor: null };

  return NextResponse.json({
    chats: initialChatsPage.items,
    nextCursor: initialChatsPage.nextCursor,
    setupStatus,
    viewer,
  });
}
