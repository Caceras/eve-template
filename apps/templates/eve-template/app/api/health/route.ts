import { NextResponse } from "next/server";
import { getSetupStatus } from "@/lib/setup";


export async function GET(request: Request) {
  const setup = await getSetupStatus();
  const startedAt = Date.now();

  try {
    const response = await fetch(new URL("/eve/v1/info", request.url), {
      cache: "no-store",
      signal: AbortSignal.timeout(3_000),
    });

    const healthy = response.ok && setup.appReady;

    return NextResponse.json(
      {
        ok: healthy,
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
