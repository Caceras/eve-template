import { NextResponse, type NextRequest } from "next/server";
import { INTERNAL_HEADER } from "@/lib/internal-auth";

// Telegram and Slack sign every delivery with their own header. A request
// without it never reaches eve, which would buffer the body (hanging on large
// ones) and log a stack trace per stranger's request.
const WEBHOOK_SECRET_HEADERS: Record<string, string> = {
  "/eve/v1/telegram": "x-telegram-bot-api-secret-token",
  "/eve/v1/slack": "x-slack-signature",
};
const MAX_WEBHOOK_BYTES = 1024 * 1024;

export function proxy(request: NextRequest) {
  const secretHeader = WEBHOOK_SECRET_HEADERS[request.nextUrl.pathname];
  if (secretHeader) {
    if (!request.headers.get(secretHeader))
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    if (Number(request.headers.get("content-length")) > MAX_WEBHOOK_BYTES)
      return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }
  if (!request.headers.has(INTERNAL_HEADER)) return NextResponse.next();
  // The scheduled-task token is for eve's loopback port only (lib/task-runner.ts
  // calls it directly), never for a request through the public app.
  const headers = new Headers(request.headers);
  headers.delete(INTERNAL_HEADER);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // Literals only (Next reads them at build time). Only the two webhooks and
  // eve requests that carry the internal header run this, so the rest of the
  // app, eve's own traffic included, never pays for it.
  matcher: [
    "/eve/v1/telegram",
    "/eve/v1/slack",
    { source: "/eve/:path*", has: [{ type: "header", key: "x-aegentica-internal" }] },
  ],
};
