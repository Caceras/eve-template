"use client";

import { Client, type ClientSession } from "eve/client";
import { EraserIcon, ListRestartIcon, ScanSearchIcon, SquareIcon, WandSparklesIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EveSessionLab() {
  const [sessionId, setSessionId] = useState("");
  const [status, setStatus] = useState("Enter an Eve session ID to inspect or control it.");
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
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
        <p className="text-sm text-muted-foreground">Eve Client SDK</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Session lifecycle</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
          These controls call Eve's fixed-session API directly. They demonstrate bounded stream
          reads plus the framework-native cancel, compact, clear, and reset operations without a
          second session abstraction.
        </p>

        <div className="mt-6 rounded-lg border bg-card p-4">
          <Input
            onChange={(event) => setSessionId(event.target.value)}
            placeholder="wrun_…"
            value={sessionId}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button disabled={busy || !sessionId.trim()} onClick={() => void inspect()} size="sm" variant="outline">
              <ScanSearchIcon className="size-4" /> Inspect stream
            </Button>
            <Button disabled={busy || !sessionId.trim()} onClick={() => void withSession((session) => session.cancel())} size="sm" variant="outline">
              <SquareIcon className="size-4" /> Cancel turn
            </Button>
            <Button disabled={busy || !sessionId.trim()} onClick={() => void withSession((session) => session.compact())} size="sm" variant="outline">
              <WandSparklesIcon className="size-4" /> Compact
            </Button>
            <Button disabled={busy || !sessionId.trim()} onClick={() => void withSession((session) => session.clear())} size="sm" variant="outline">
              <EraserIcon className="size-4" /> Clear context
            </Button>
            <Button disabled={busy || !sessionId.trim()} onClick={() => void withSession((session) => session.reset({ reason: "Requested from Eve Template session lab" }))} size="sm" variant="outline">
              <ListRestartIcon className="size-4" /> Reset
            </Button>
          </div>
          <p className="mt-3 break-words text-xs text-muted-foreground">{status}</p>
        </div>

        <div className="mt-5 rounded-lg border bg-card">
          <div className="border-b px-4 py-3 text-sm font-medium">Durable event stream</div>
          {events.length ? (
            <pre className="max-h-[60vh] overflow-auto p-4 text-xs leading-5">
              {JSON.stringify(events, null, 2)}
            </pre>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">No event snapshot loaded.</p>
          )}
        </div>
      </div>
    </div>
  );
}
