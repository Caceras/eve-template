"use client";
import { CalendarClockIcon, EllipsisIcon, Loader2Icon, PlusIcon } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useChatShell } from "./chat-shell-context";

type Task = {
  id: string;
  title: string;
  prompt: string;
  cron: string | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "sent" | "failed" | null;
  lastChatId?: string | null;
  failures: number;
};

type Repeat = "once" | "daily" | "weekdays" | "weekly" | "custom";
type Draft = {
  id?: string;
  title: string;
  prompt: string;
  repeat: Repeat;
  date: string;
  time: string;
  weekday: string;
  cron: string;
  timezone: string;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const REPEATS: { value: Repeat; label: string }[] = [
  { value: "once", label: "Once" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Every week" },
  { value: "custom", label: "Custom (cron)" },
];

const pad = (value: number) => String(value).padStart(2, "0");
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function localParts(date: Date) {
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function newDraft(): Draft {
  const soon = new Date(Date.now() + 60 * 60_000);
  soon.setMinutes(0, 0, 0);
  return {
    title: "",
    prompt: "",
    repeat: "daily",
    ...localParts(soon),
    weekday: "1",
    cron: "0 8 * * 1-5",
    timezone: browserTimezone(),
  };
}

function draftFromTask(task: Task): Draft {
  const base = { ...newDraft(), id: task.id, title: task.title, prompt: task.prompt };
  base.timezone = task.timezone;
  if (!task.cron) {
    if (task.nextRunAt) Object.assign(base, localParts(new Date(task.nextRunAt)));
    return { ...base, repeat: "once" };
  }
  const match = /^(\d{1,2}) (\d{1,2}) \* \* (\*|1-5|[0-6])$/.exec(task.cron);
  if (!match) return { ...base, repeat: "custom", cron: task.cron };
  const time = `${pad(Number(match[2]))}:${pad(Number(match[1]))}`;
  if (match[3] === "*") return { ...base, repeat: "daily", time };
  if (match[3] === "1-5") return { ...base, repeat: "weekdays", time };
  return { ...base, repeat: "weekly", time, weekday: match[3]! };
}

/** The schedule fields the API expects, derived from the friendly presets. */
function scheduleOf(draft: Draft) {
  const [hour, minute] = draft.time.split(":").map(Number);
  const at = `${minute ?? 0} ${hour ?? 0}`;
  switch (draft.repeat) {
    case "once":
      return {
        cron: null,
        runAt: new Date(`${draft.date}T${draft.time}`).toISOString(),
        timezone: browserTimezone(),
      };
    case "daily":
      return { cron: `${at} * * *`, runAt: null, timezone: draft.timezone };
    case "weekdays":
      return { cron: `${at} * * 1-5`, runAt: null, timezone: draft.timezone };
    case "weekly":
      return { cron: `${at} * * ${draft.weekday}`, runAt: null, timezone: draft.timezone };
    case "custom":
      return { cron: draft.cron.trim(), runAt: null, timezone: draft.timezone };
  }
}

function formatWhen(iso: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function repeatLabel(task: Task) {
  if (!task.cron) return "Once";
  const draft = draftFromTask(task);
  if (draft.repeat === "daily") return `Every day at ${draft.time}`;
  if (draft.repeat === "weekdays") return `Weekdays at ${draft.time}`;
  if (draft.repeat === "weekly") return `${WEEKDAYS[Number(draft.weekday)]}s at ${draft.time}`;
  return `Custom · ${task.cron}`;
}

function statusLine(task: Task) {
  const failed = task.lastStatus === "failed";
  if (failed && task.failures > 0 && task.enabled) return "Last run failed · retrying soon";
  const state = !task.enabled
    ? task.cron || task.nextRunAt
      ? "Paused"
      : "Finished"
    : task.nextRunAt
      ? `Next ${formatWhen(task.nextRunAt, task.timezone)}`
      : "Scheduled";
  return failed ? `Last run hit an error · ${state}` : state;
}

async function request(body?: Record<string, unknown>): Promise<Task[]> {
  const response = await fetch("/api/settings/schedules", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not complete the request.");
  return data.tasks;
}

export function TasksPage() {
  const { viewer, requestSignIn } = useChatShell();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const refresh = useCallback(async () => {
    try {
      setTasks(await request());
    } catch (reason) {
      setError((reason as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!viewer) return;
    void refresh();
    // A queued "Run now" finishes within a minute or two; keep the list current.
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [viewer, refresh]);

  async function act(action: "run" | "pause" | "resume" | "delete", task: Task) {
    setBusy(`${action}:${task.id}`);
    setError("");
    setNotice("");
    try {
      setTasks(await request({ action, id: task.id }));
      if (action === "run")
        setNotice(`“${task.title}” is starting. The result appears in your chats shortly.`);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-20 sm:px-8">
        <CalendarClockIcon className="mb-4 size-6" />
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          {viewer && tasks !== null && (
            <Button className="h-11 md:h-9" onClick={() => setDraft(newDraft())}>
              <PlusIcon className="size-4" />
              New task
            </Button>
          )}
        </div>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Ægentica runs these on its own and saves each result as a chat. With notifications on,
          your phone lets you know when one is ready. You can also ask in chat, for example “every
          weekday at 8, summarise the news on AI”.
        </p>

        {!viewer ? (
          <div className="mt-8 rounded-lg border p-5">
            <p className="mb-4 text-sm">Sign in to manage tasks.</p>
            <Button onClick={() => requestSignIn()}>Sign in</Button>
          </div>
        ) : tasks === null ? (
          !error && <p className="mt-8 text-sm text-muted-foreground">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <div className="mt-8 rounded-lg border p-5">
            <p className="text-sm font-medium">No tasks yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a reminder, a daily briefing or a weekly check-in.
            </p>
            <Button className="mt-4 h-11 md:h-9" onClick={() => setDraft(newDraft())}>
              <PlusIcon className="size-4" />
              New task
            </Button>
          </div>
        ) : (
          <ul className="mt-8 divide-y rounded-lg border bg-card">
            {tasks.map((task) => (
              <li key={task.id} className="flex items-center gap-2 p-3 sm:px-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{task.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {repeatLabel(task)}
                    <span className="hidden sm:inline"> · </span>
                    <br className="sm:hidden" />
                    {statusLine(task)}
                  </p>
                  {task.lastChatId && (
                    <Link
                      className="mt-1 inline-flex min-h-8 items-center text-xs underline underline-offset-4"
                      href={`/chat/${task.lastChatId}`}
                    >
                      View latest result
                    </Link>
                  )}
                </div>
                <Button
                  variant="outline"
                  className="h-11 md:h-8"
                  disabled={Boolean(busy)}
                  onClick={() => void act("run", task)}
                >
                  {busy === `run:${task.id}` && <Loader2Icon className="size-4 animate-spin" />}
                  Run now
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      aria-label={`More actions for ${task.title}`}
                      variant="ghost"
                      className="size-11 md:size-8"
                      disabled={Boolean(busy)}
                    >
                      {busy && busy.endsWith(task.id) && !busy.startsWith("run") ? (
                        <Loader2Icon className="size-4 animate-spin" />
                      ) : (
                        <EllipsisIcon className="size-4" />
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => setDraft(draftFromTask(task))}>
                      Edit
                    </DropdownMenuItem>
                    {(task.enabled || task.cron || task.nextRunAt) && (
                      <DropdownMenuItem
                        onSelect={() => void act(task.enabled ? "pause" : "resume", task)}
                      >
                        {task.enabled ? "Pause" : "Resume"}
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      className="text-destructive"
                      onSelect={() => void act("delete", task)}
                    >
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
        {notice && (
          <p role="status" className="mt-3 text-sm">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <TaskDialog
        draft={draft}
        onClose={() => setDraft(null)}
        onSaved={(next) => {
          setTasks(next);
          setDraft(null);
        }}
      />
    </div>
  );
}

function TaskDialog({
  draft,
  onClose,
  onSaved,
}: {
  draft: Draft | null;
  onClose: () => void;
  onSaved: (tasks: Task[]) => void;
}) {
  const [value, setValue] = useState<Draft | null>(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setValue(draft);
    setError("");
  }, [draft]);

  const update = (patch: Partial<Draft>) =>
    setValue((current) => current && { ...current, ...patch });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!value) return;
    setSaving(true);
    setError("");
    try {
      const body = {
        action: value.id ? "update" : "create",
        id: value.id,
        title: value.title,
        prompt: value.prompt,
        ...scheduleOf(value),
      };
      onSaved(await request(body));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={Boolean(draft)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        {value && (
          <form className="grid gap-4" onSubmit={(event) => void submit(event)}>
            <DialogHeader>
              <DialogTitle>{value.id ? "Edit task" : "New task"}</DialogTitle>
              <DialogDescription>
                Ægentica does this at the chosen time and saves the result as a chat.
              </DialogDescription>
            </DialogHeader>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Name</span>
              <Input
                required
                maxLength={120}
                placeholder="Morning briefing"
                value={value.title}
                onChange={(event) => update({ title: event.target.value })}
                className="h-11 md:h-9"
              />
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">What should Ægentica do?</span>
              <Textarea
                required
                maxLength={4000}
                rows={4}
                placeholder="Check the weather in Stockholm and suggest what to wear."
                value={value.prompt}
                onChange={(event) => update({ prompt: event.target.value })}
              />
            </label>
            <div className="grid gap-1.5 text-sm">
              <span className="font-medium">Repeat</span>
              <Select
                value={value.repeat}
                onValueChange={(repeat) => update({ repeat: repeat as Repeat })}
              >
                <SelectTrigger aria-label="Repeat" className="h-11 w-full md:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {REPEATS.map((repeat) => (
                    <SelectItem key={repeat.value} value={repeat.value}>
                      {repeat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {value.repeat === "custom" ? (
              <label className="grid gap-1.5 text-sm">
                <span className="font-medium">Cron expression</span>
                <Input
                  required
                  className="h-11 font-mono md:h-9"
                  placeholder="0 8 * * 1-5"
                  value={value.cron}
                  onChange={(event) => update({ cron: event.target.value })}
                />
                <span className="text-xs text-muted-foreground">
                  Minute, hour, day of month, month, weekday. At most every 15 minutes.
                </span>
              </label>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {value.repeat === "once" && (
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">Date</span>
                    <Input
                      required
                      type="date"
                      className="h-11 md:h-9"
                      value={value.date}
                      onChange={(event) => update({ date: event.target.value })}
                    />
                  </label>
                )}
                {value.repeat === "weekly" && (
                  <div className="grid gap-1.5 text-sm">
                    <span className="font-medium">Day</span>
                    <Select value={value.weekday} onValueChange={(weekday) => update({ weekday })}>
                      <SelectTrigger aria-label="Day" className="h-11 w-full md:h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WEEKDAYS.map((day, index) => (
                          <SelectItem key={day} value={String(index)}>
                            {day}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <label className="grid gap-1.5 text-sm">
                  <span className="font-medium">Time</span>
                  <Input
                    required
                    type="time"
                    className="h-11 md:h-9"
                    value={value.time}
                    onChange={(event) => update({ time: event.target.value })}
                  />
                </label>
              </div>
            )}
            {value.repeat !== "once" && (
              <p className="text-xs text-muted-foreground">Time zone: {value.timezone}</p>
            )}
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" className="h-11 md:h-9" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" className="h-11 md:h-9" disabled={saving}>
                {saving && <Loader2Icon className="size-4 animate-spin" />}
                {value.id ? "Save" : "Create task"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
