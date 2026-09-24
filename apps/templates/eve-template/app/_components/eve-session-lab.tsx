"use client";

import { Client, type ClientSession } from "eve/client";
import { CheckCircle2Icon, EraserIcon, ListRestartIcon, ScanSearchIcon, SquareIcon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EveSessionLab() {
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState("Enter a session ID to inspect its durable event stream.");
  const [events, setEvents] = useState<unknown[]>([]);
  const [busy, setBusy] = useState(false);

  const withSession = async (operation: (session: ClientSession) => Promise<unknown>) => {
    const id = sessionId.trim();
    if (!id) return;
    setBusy(true);
    try {
      const session = new Client({ host: "" }).sessions.attach(id);
      const result = await operation(session);
      setStatus(JSON.stringify(result));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Session operation failed.");
    } finally {
      setBusy(false);
    }
  };

  const inspect = async () => {
    const id = sessionId.trim();
    if (!id) return;
    setBusy(true);
    try {
      const session = new Client({ host: "" }).sessions.attach(id);
      const collected: unknown[] = [];
      for await (const event of session.stream({ follow: false })) {
        collected.push(event);
      }
      setEvents(collected);
      setStatus(`Loaded ${collected.length} durable stream events.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not inspect session.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pb-16 pt-16 sm:px-6 sm:pt-14">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Inspect a durable conversation by session ID and manage its low-level lifecycle when needed.
          </p>
        </div>

        <div className="mt-7 rounded-xl border bg-card p-4 sm:p-5">
          <Input
            onChange={(event) => setSessionId(event.target.value)}
            placeholder="wrun_…"
            value={sessionId}
          />
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Button disabled={busy || !sessionId.trim()} onClick={() => void inspect()} className="justify-start sm:justify-center" size="sm" variant="outline">
              <ScanSearchIcon className="size-4" /> Inspect stream
            </Button>
            <Button disabled={busy || !sessionId.trim()} onClick={() => void withSession((session) => session.cancel())} className="justify-start sm:justify-center" size="sm" variant="outline">
              <SquareIcon className="size-4" /> Cancel turn
            </Button>
            <Button disabled={busy || !sessionId.trim()} onClick={() => void withSession((session) => session.compact())} className="justify-start sm:justify-center" size="sm" variant="outline">
              <WandSparklesIcon className="size-4" /> Compact
            </Button>
            <Button disabled={busy || !sessionId.trim()} onClick={() => void withSession((session) => session.clear())} className="justify-start sm:justify-center" size="sm" variant="outline">
              <EraserIcon className="size-4" /> Clear context
            </Button>
            <Button disabled={busy || !sessionId.trim()} onClick={() => void withSession((session) => session.reset({ reason: "Requested from Ægentica Activity" }))} className="justify-start sm:justify-center" size="sm" variant="outline">
              <ListRestartIcon className="size-4" /> Reset
            </Button>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-muted/45 px-3 py-2.5 text-xs text-muted-foreground">
            <CheckCircle2Icon className="mt-0.5 size-3.5 shrink-0" />
            <p className="break-words">{status}</p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-xl border bg-card">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <span className="text-sm font-medium">Event stream</span>
            <span className="text-xs tabular-nums text-muted-foreground">{events.length} events</span>
          </div>
          {events.length ? (
            <pre className="max-h-[60vh] overflow-auto bg-muted/20 p-4 text-[11px] leading-5">
              {JSON.stringify(events, null, 2)}
            </pre>
          ) : (
            <div className="px-4 py-10 text-center">
            <p className="text-sm font-medium">No session loaded</p>
            <p className="mt-1 text-xs text-muted-foreground">Inspect a session to view its durable event stream.</p>
          </div>
          )}
        </div>
      </div>
    </div>
  );
}
