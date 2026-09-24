import { NextResponse } from "next/server";
import { getSetupStatus } from "@/lib/setup";

export async function GET() {
  const setup = await getSetupStatus();
  const startedAt = Date.now();
  const evePort = process.env.EVE_NEXT_PRODUCTION_PORT?.trim() || "4274";

  try {
    const response = await fetch(`http://127.0.0.1:${evePort}/eve/v1/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });

    const healthy = response.ok;

    return NextResponse.json(
      {
        ok: healthy,
        release: "polish-2026-09-24b",
        app: setup.appReady ? "ready" : "setup-required",
        auth: setup.authMode,
        eve: response.ok ? "ready" : "unavailable",
        latencyMs: Date.now() - startedAt,
        storage: setup.storageMode,
      },
      { status: healthy ? 200 : 503 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        release: "polish-2026-09-24b",
        app: setup.appReady ? "ready" : "setup-required",
        auth: setup.authMode,
        eve: "unavailable",
        latencyMs: Date.now() - startedAt,
        storage: setup.storageMode,
      },
      { status: 503 },
    );
  }
}
