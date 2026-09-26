import { NextResponse } from "next/server";
import type { SetupStatus } from "@/lib/chat/types";
import { probeChatDatabase } from "@/lib/db/sqlite-queries";
import { RELEASE } from "@/lib/release";
import { getSetupStatus } from "@/lib/setup";

async function isEveReady(evePort: string) {
  try {
    const response = await fetch(`http://127.0.0.1:${evePort}/eve/v1/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

function databaseState(setup: SetupStatus) {
  if (setup.storageMode !== "database") return "none";
  // Postgres: getSetupStatus has just queried its schema. SQLite: one read.
  const ready = setup.databaseConfigured ? setup.databaseSchemaReady : probeChatDatabase();
  return ready ? "ready" : "unavailable";
}

/**
 * 200 only when the app can serve a chat: eve answers, sign-in is set up and
 * the chat database answers. Anything else is 503 with the failing part named,
 * so Docker's health check, CI and `pnpm verify:live` catch an unusable app.
 */
export async function GET() {
  const setup = await getSetupStatus();
  const startedAt = Date.now();
  const evePort = process.env.EVE_NEXT_PRODUCTION_PORT?.trim() || "4274";
  const eve = await isEveReady(evePort);
  const database = databaseState(setup);
  const ok = eve && setup.appReady && database === "ready";

  return NextResponse.json(
    {
      ok,
      release: RELEASE,
      app: setup.appReady ? "ready" : "setup-required",
      auth: setup.authMode,
      eve: eve ? "ready" : "unavailable",
      database,
      latencyMs: Date.now() - startedAt,
      storage: setup.storageMode,
    },
    { status: ok ? 200 : 503 },
  );
}
