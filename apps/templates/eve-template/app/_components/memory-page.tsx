"use client";
import { CheckIcon, Loader2Icon, PencilIcon, Trash2Icon, UploadIcon } from "lucide-react";
import Link from "next/link";
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
import { PageSignInButton } from "./page-sign-in";
import { ConfirmButton } from "./confirm-button";
import { LoadError } from "./load-error";

type Entry = { index: number; text: string };
type Status =
  | { available: false }
  | {
      available: true;
      ready: boolean;
      entries: Entry[];
      usage: { used: number; limit: number };
      /** After an import: lines saved, and lines skipped as already saved or repeated. */
      imported?: { added: number; skipped: number };
    };

/** The start of a memory, so each row's buttons say which memory they act on. */
const snippet = (text: string) => (text.length > 40 ? `${text.slice(0, 40).trimEnd()}…` : text);
const count = (value: number, noun: string) => `${value} ${noun}${value === 1 ? "" : "s"}`;
function importSummary({ added, skipped }: { added: number; skipped: number }) {
  if (!added) return `Nothing new to import: ${count(skipped, "line")} already saved.`;
  const skippedNote = skipped
    ? ` Skipped ${count(skipped, "line")} already saved or repeated.`
    : "";
  return `Imported ${added === 1 ? "1 memory" : `${added} memories`}.${skippedNote}`;
}

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
  const { viewer } = useChatShell();
  const [status, setStatus] = useState<Status | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [importing, setImporting] = useState(false);
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadFailed, setLoadFailed] = useState(false);

  const refresh = useCallback(async () => {
    setLoadFailed(false);
    try {
      setStatus(await request());
    } catch {
      setLoadFailed(true);
    }
  }, []);
  useEffect(() => {
    if (viewer) void refresh();
  }, [viewer, refresh]);

  async function act(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      const next = await request(body);
      setStatus(next);
      return next;
    } catch (reason) {
      setError((reason as Error).message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  const ready = status?.available && status.ready;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-16 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Memory</h1>
          {ready && (
            <Button
              variant="outline"
              className="h-11 pointer-fine:md:h-9"
              onClick={() => {
                setImportText("");
                setError("");
                setNotice("");
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
            <PageSignInButton />
          </div>
        ) : status === null ? (
          loadFailed ? (
            <LoadError
              className="mt-8"
              message="Couldn't load your memory. Check the connection and try again."
              onRetry={() => void refresh()}
            />
          ) : (
            <p className="mt-8 text-sm text-muted-foreground" role="status">
              Loading memory…
            </p>
          )
        ) : !status.available ? (
          <p className="mt-8 rounded-lg border p-5 text-sm">
            Long-term memory is not configured on this server. Set <code>EVE_MEMORY_DIR</code> to a
            persistent folder to turn it on.
          </p>
        ) : !status.ready ? (
          <div className="mt-8 rounded-lg border p-5">
            <p className="mb-4 text-sm">
              Memory starts with your first message. Send Ægentica anything, then come back here to
              add or import memories.
            </p>
            <Button asChild className="h-11 pointer-fine:md:h-9">
              <Link href="/">Start a chat</Link>
            </Button>
          </div>
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
                className="h-11 min-w-0 sm:flex-1"
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
                          className="size-11 pointer-fine:md:size-9"
                          disabled={Boolean(busy) || !editing.text.trim()}
                          title={editing.text.trim() ? undefined : "Use Forget to remove a memory"}
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
                          aria-label={`Edit “${snippet(entry.text)}”`}
                          className="size-11 text-muted-foreground pointer-fine:md:size-9"
                          disabled={Boolean(busy)}
                          onClick={() => setEditing(entry)}
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <ConfirmButton
                          variant="ghost"
                          size="icon"
                          aria-label={`Forget “${snippet(entry.text)}”`}
                          className="size-11 text-muted-foreground pointer-fine:md:size-9"
                          disabled={Boolean(busy)}
                          title="Forget this memory?"
                          description={`“${entry.text}” will be removed from Ægentica's memory everywhere.`}
                          confirmLabel="Forget"
                          onConfirm={() =>
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
                        </ConfirmButton>
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
        {notice && (
          <p role="status" className="mt-3 text-sm text-muted-foreground">
            {notice}
          </p>
        )}
        {/* While importing, the dialog shows the error where it can be seen. */}
        {error && !importing && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
          <form
            className="grid gap-4"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              void act("import", { action: "import", text: importText }).then((next) => {
                if (!next) return;
                setImporting(false);
                if (next.available && next.imported) setNotice(importSummary(next.imported));
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Import memories</DialogTitle>
              <DialogDescription>
                Paste notes from another assistant, one per line, up to 60 at a time. In ChatGPT,
                open Settings → Personalization → Manage memories and copy the list.
              </DialogDescription>
            </DialogHeader>
            {/* No maxLength: a cut paste would lose lines unseen; the server explains its limits. */}
            <Textarea
              aria-label="Memories to import"
              rows={8}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={"Lives in Stockholm\nPrefers short, direct answers"}
            />
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                className="h-11 pointer-fine:md:h-9"
                onClick={() => setImporting(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="h-11 pointer-fine:md:h-9"
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
