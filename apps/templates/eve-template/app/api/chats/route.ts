import { connection, NextResponse } from "next/server";
import { chatPageSize } from "@/lib/chat/paging";
import { listChatsPageByUser } from "@/lib/db/queries";
import { jsonResponse } from "@/lib/http/json";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function GET(request: Request) {
  // Per-viewer data: without this, the build prerenders the empty logged-out answer.
  await connection();
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady || setupStatus.storageMode !== "database") {
    return NextResponse.json({ chats: [], nextCursor: null });
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    return NextResponse.json({ chats: [], nextCursor: null }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  // Search asks for up to 100 at once (?limit=); the sidebar pages 20 at a time.
  const page = await listChatsPageByUser(
    viewer.id,
    searchParams.get("cursor"),
    chatPageSize(searchParams.get("limit")),
  );

  return jsonResponse(request, {
    chats: page.items,
    nextCursor: page.nextCursor,
  });
}
