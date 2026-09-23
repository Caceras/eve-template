"use client";
import {
  BrainIcon,
  CheckIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useChatShell } from "./chat-shell-context";

type Entry = { index: number; text: string };
type Status =
  | { available: false }
  | { available: true; ready: boolean; entries: Entry[]; usage: { used: number; limit: number } };

async function request(body?: Record<string, unknown>): Promise<Status> {
  const response = await fetch("/api/settings/memory", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not complete the request.");
  return data;
}

export function MemoryPage() {
  const { viewer, requestSignIn } = useChatShell();
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      setStatus(await request());
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);
  useEffect(() => {
    if (viewer) void refresh();
  }, [viewer, refresh]);

  async function act(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError("");
    try {
      setStatus(await request(body));
      return true;
    } catch (reason) {
      setError((reason as Error).message);
      return false;
    } finally {
      setBusy(null);
    }
  }

  const ready = status?.available && status.ready;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-20 sm:px-8">
        <BrainIcon className="mb-4 size-6" />
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
          {ready && (
            <Button
              variant="outline"
              className="h-11 md:h-9"
              onClick={() => {
                setImportText("");
                setImporting(true);
              }}
            >
              <UploadIcon className="size-4" />
              Import
            </Button>
          )}
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          What Ægentica remembers about you across chats, Telegram and scheduled tasks. It saves
          things when you ask it to remember them, and you can add, edit or remove them here.
        </p>

        {!viewer ? (
          <div className="mt-8 rounded-lg border p-5">
            <p className="mb-4 text-sm">Sign in to see your memory.</p>
            <Button onClick={() => requestSignIn()}>Sign in</Button>
          </div>
        ) : status === null ? (
          !error && <p className="mt-8 text-sm text-muted-foreground">Loading memory…</p>
        ) : !status.available ? (
          <p className="mt-8 rounded-lg border p-5 text-sm">
            Long-term memory is not configured on this server. Set <code>EVE_MEMORY_DIR</code> to a
            persistent folder to turn it on.
          </p>
        ) : !status.ready ? (
          <p className="mt-8 rounded-lg border p-5 text-sm">
            Memory starts with your first message. Send Ægentica anything, then come back here.
          </p>
        ) : (
          <>
            <form
              className="mt-8 flex flex-col gap-2 sm:flex-row"
              onSubmit={(event: FormEvent) => {
                event.preventDefault();
                void act("add", { action: "add", text: draft }).then((ok) => ok && setDraft(""));
              }}
            >
              <label className="sr-only" htmlFor="memory-new">
                Something to remember
              </label>
              <Input
                id="memory-new"
                value={draft}
                maxLength={2000}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Something to remember"
                className="h-11 min-w-0 flex-1"
              />
              <Button className="h-11" type="submit" disabled={Boolean(busy) || !draft.trim()}>
                {busy === "add" && <Loader2Icon className="size-4 animate-spin" />}
                Remember
              </Button>
            </form>

            {status.entries.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">
                Nothing saved yet. Tell Ægentica “remember that…”, add a line above, or import notes
                from another assistant.
              </p>
            ) : (
              <ul className="mt-6 divide-y rounded-lg border bg-card">
                {status.entries.map((entry) => (
                  <li key={entry.index} className="flex items-start gap-2 p-3 sm:px-4">
                    {editing?.index === entry.index ? (
                      <form
                        className="flex min-w-0 flex-1 items-start gap-2"
                        onSubmit={(event: FormEvent) => {
                          event.preventDefault();
                          void act(`update:${entry.index}`, {
                            action: "update",
                            index: entry.index,
                            text: editing.text,
                          }).then((ok) => ok && setEditing(null));
                        }}
                      >
                        <Textarea
                          autoFocus
                          aria-label="Edit memory"
                          rows={2}
                          maxLength={2000}
                          value={editing.text}
                          onChange={(event) => setEditing({ ...editing, text: event.target.value })}
                          className="min-h-11 flex-1"
                        />
                        <Button
                          type="submit"
                          size="icon"
                          aria-label="Save memory"
                          className="size-11 md:size-9"
                          disabled={Boolean(busy)}
                        >
                          {busy === `update:${entry.index}` ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <CheckIcon className="size-4" />
                          )}
                        </Button>
                      </form>
                    ) : (
                      <>
                        <p className="min-w-0 flex-1 py-2 text-sm leading-6">{entry.text}</p>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Edit memory"
                          className="size-11 text-muted-foreground md:size-9"
                          disabled={Boolean(busy)}
                          onClick={() => setEditing(entry)}
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Forget this"
                          className="size-11 text-muted-foreground md:size-9"
                          disabled={Boolean(busy)}
                          onClick={() =>
                            void act(`remove:${entry.index}`, {
                              action: "remove",
                              index: entry.index,
                            })
                          }
                        >
                          {busy === `remove:${entry.index}` ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <Trash2Icon className="size-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              {status.usage.used.toLocaleString()} of {status.usage.limit.toLocaleString()}{" "}
              characters used. Never store passwords, keys or card numbers here.
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <form
            className="grid gap-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void act("import", { action: "import", text: importText }).then(
                (ok) => ok && setImporting(false),
              );
            }}
          >
            <DialogHeader>
              <DialogTitle>Import memories</DialogTitle>
              <DialogDescription>
                Paste notes from another assistant, one per line. In ChatGPT, open Settings →
                Personalization → Manage memories and copy the list.
              </DialogDescription>
            </DialogHeader>
            <Textarea
              aria-label="Memories to import"
              rows={8}
              maxLength={7000}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={"Lives in Stockholm\nPrefers short, direct answers"}
            />
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="h-11 md:h-9"
                onClick={() => setImporting(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-11 md:h-9"
                disabled={Boolean(busy) || !importText.trim()}
              >
                {busy === "import" && <Loader2Icon className="size-4 animate-spin" />}
                Import
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
