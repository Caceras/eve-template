"use client";
import {
  ChevronDownIcon,
  EllipsisIcon,
  Loader2Icon,
  MessageSquareIcon,
  PencilIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import { loadRuntimeSkills, skillLabel, skillSummary, type RuntimeSkill } from "@/lib/skills";
import { cn } from "@/lib/utils";
import { StickyBar } from "@/components/chat/sticky-bar";
import { useChatShell } from "./chat-shell-context";
import { PageSignInButton } from "./page-sign-in";

type Task = {
  id: string;
  title: string;
  prompt: string;
  skill?: string | null;
  cron: string | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "sent" | "failed" | "waiting" | null;
  lastChatId?: string | null;
  failures: number;
  /** A queued Run now; the schedule itself is unchanged. */
  runNowAt?: string | null;
};

type Repeat = "once" | "daily" | "weekdays" | "weekly" | "custom";
type Draft = {
  id?: string;
  title: string;
  prompt: string;
  /** Skill name, or NO_SKILL. */
  skill: string;
  repeat: Repeat;
  date: string;
  time: string;
  weekday: string;
  cron: string;
  timezone: string;
};

// Skill names start with a letter or digit, so this never collides with one.
const NO_SKILL = "__none";
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

function newDraft(skill?: RuntimeSkill): Draft {
  // The next 08:00, the usual time for a briefing, whether it repeats or runs once.
  const soon = new Date();
  if (soon.getHours() >= 8) soon.setDate(soon.getDate() + 1);
  soon.setHours(8, 0, 0, 0);
  return {
    title: skill ? skillLabel(skill.name) : "",
    prompt: "",
    skill: skill?.name ?? NO_SKILL,
    repeat: "daily",
    ...localParts(soon),
    weekday: "1",
    cron: "0 8 * * 1-5",
    timezone: browserTimezone(),
  };
}

function draftFromTask(task: Task): Draft {
  const base = {
    ...newDraft(),
    id: task.id,
    title: task.title,
    prompt: task.prompt,
    skill: task.skill || NO_SKILL,
  };
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
  if (task.runNowAt) return failed ? "Run now failed · retrying soon" : "Starting within a minute";
  if (failed && task.failures > 0 && task.enabled) return "Last run failed · retrying soon";
  const state = !task.enabled
    ? task.cron || task.nextRunAt
      ? "Paused"
      : "Finished"
    : task.nextRunAt
      ? `Next ${formatWhen(task.nextRunAt, task.timezone)}`
      : "Scheduled";
  if (failed) return `Last run hit an error · ${state}`;
  return task.lastStatus === "waiting" ? `Last run is waiting for you · ${state}` : state;
}

type Filter = "all" | "active" | "paused" | "completed";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
];

function taskState(task: Task): Exclude<Filter, "all"> {
  if (task.enabled) return "active";
  return task.cron || task.nextRunAt ? "paused" : "completed";
}

const CREATE_PROMPT = "Schedule a task for me: ";
const LOAD_ERROR = "Could not load tasks. Check your connection and try again.";

async function request(body?: Record<string, unknown>): Promise<Task[]> {
  const response = await fetch("/api/settings/schedules", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => {
    throw new Error("Could not reach Ægentica. Check your connection and try again.");
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Could not complete the request.");
  return data.tasks;
}

export function TasksPage() {
  const { viewer } = useChatShell();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [deleteTask, setDeleteTask] = useState<Task | null>(null);
  const [skills, setSkills] = useState<RuntimeSkill[]>([]);
  const router = useRouter();

  const createWithAgent = () => {
    try {
      window.sessionStorage.setItem("eve-chat-draft", CREATE_PROMPT);
    } catch {
      // Without storage the chat simply opens empty.
    }
    router.push("/");
  };
  const needle = query.trim().toLowerCase();
  const shown = (tasks ?? []).filter(
    (task) =>
      (filter === "all" || taskState(task) === filter) &&
      (!needle || `${task.title} ${task.prompt}`.toLowerCase().includes(needle)),
  );

  const refresh = useCallback(async () => {
    try {
      setTasks(await request());
      // A later successful refresh clears an earlier failed one.
      setError((current) => (current === LOAD_ERROR ? "" : current));
    } catch {
      setError(LOAD_ERROR);
    }
  }, []);

  useEffect(() => {
    if (!viewer) return;
    // Skills are optional here; the form still works when inspection fails.
    loadRuntimeSkills().then(setSkills, () => setSkills([]));
  }, [viewer]);

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
      <div className="mx-auto max-w-3xl px-4 pb-16 pt-16 sm:px-6">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
          {viewer && tasks !== null && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button className="h-11 pointer-fine:md:h-9">
                  Create
                  <ChevronDownIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={createWithAgent}>
                  <MessageSquareIcon className="size-4" />
                  Create with Ægentica
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDraft(newDraft())}>
                  <PencilIcon className="size-4" />
                  Set up manually
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            <PageSignInButton />
          </div>
        ) : tasks === null ? (
          !error && <p className="mt-8 text-sm text-muted-foreground">Loading tasks…</p>
        ) : tasks.length === 0 ? (
          <div className="mt-8 rounded-lg border p-5">
            <p className="text-sm font-medium">No tasks yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a reminder, a daily briefing or a weekly check-in.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button className="h-11 pointer-fine:md:h-9" onClick={createWithAgent}>
                <MessageSquareIcon className="size-4" />
                Create with Ægentica
              </Button>
              <Button
                className="h-11 pointer-fine:md:h-9"
                onClick={() => setDraft(newDraft())}
                variant="outline"
              >
                Set up manually
              </Button>
            </div>
            {skills.length > 0 && (
              <>
                <p className="mt-5 text-xs font-medium text-muted-foreground">
                  Or start from a skill
                </p>
                <div className="scroll-row -mx-5 mt-2 gap-2 px-5 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:[mask-image:none]">
                  {skills.map((skill) => (
                    <Button
                      className="h-11 shrink-0 snap-start pointer-fine:md:h-8"
                      key={skill.name}
                      onClick={() => setDraft(newDraft(skill))}
                      size="sm"
                      title={skillSummary(skill.description)}
                      variant="secondary"
                    >
                      <SparklesIcon className="size-3.5" />
                      {skillLabel(skill.name)}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="relative mt-8">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Search tasks"
                className="h-11 pl-9"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search tasks"
                value={query}
              />
            </div>
            <StickyBar className="mt-3">
              <div
                aria-label="Filter tasks"
                className="scroll-row -mx-4 gap-1 px-4 sm:-mx-6 sm:px-6"
                role="group"
              >
                {FILTERS.map((item) => (
                  <button
                    aria-pressed={filter === item.value}
                    className={cn(
                      "h-11 shrink-0 rounded-md px-3 text-sm transition-colors pointer-fine:md:h-8",
                      filter === item.value
                        ? "bg-muted/70 text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                    )}
                    key={item.value}
                    onClick={() => setFilter(item.value)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </StickyBar>
            {shown.length === 0 ? (
              <p className="mt-6 text-sm text-muted-foreground">No tasks match.</p>
            ) : (
              <ul className="mt-4 divide-y rounded-lg border bg-card">
                {shown.map((task) => (
                  <li key={task.id} className="flex items-center gap-2 p-3 sm:px-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{task.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {repeatLabel(task)}
                        {task.skill && ` · ${skillLabel(task.skill)}`}
                        <span className="hidden sm:inline"> · </span>
                        <br className="sm:hidden" />
                        {statusLine(task)}
                      </p>
                      {task.lastChatId && (
                        <Link
                          className="mt-1 inline-flex min-h-11 items-center text-xs underline underline-offset-4 pointer-fine:md:min-h-8"
                          href={`/chat/${task.lastChatId}`}
                        >
                          View latest result
                        </Link>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      className="h-11 pointer-fine:md:h-8"
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
                          className="size-11 pointer-fine:md:size-8"
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
                          variant="destructive"
                          onSelect={() => setDeleteTask(task)}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
        {notice && (
          <p role="status" className="mt-3 text-sm">
            {notice}
          </p>
        )}
        {error && (
          <div role="alert" className="mt-3 flex flex-wrap items-center gap-3">
            <p className="text-sm text-destructive">{error}</p>
            {error === LOAD_ERROR && (
              <Button
                className="h-11 pointer-fine:md:h-8"
                onClick={() => void refresh()}
                variant="outline"
              >
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
      <AlertDialog
        open={Boolean(deleteTask)}
        onOpenChange={(open) => {
          if (!open) setDeleteTask(null);
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTask
                ? `“${deleteTask.title}” will stop running and be removed. Previous result chats stay in your history.`
                : "This task will be removed."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11 pointer-fine:md:h-9">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="h-11 pointer-fine:md:h-9"
              variant="destructive"
              onClick={() => {
                if (!deleteTask) return;
                void act("delete", deleteTask);
                setDeleteTask(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <TaskDialog
        draft={draft}
        skills={skills}
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
  skills,
  onClose,
  onSaved,
}: {
  draft: Draft | null;
  skills: RuntimeSkill[];
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
  const chosen = skills.find(({ name }) => name === value?.skill);

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
        skill: value.skill === NO_SKILL ? null : value.skill,
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
      <DialogContent className="max-h-[calc(100%-2rem)] overflow-y-auto sm:max-w-lg">
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
                className="h-11 pointer-fine:md:h-9"
              />
            </label>
            <div className="grid gap-1.5 text-sm">
              <span className="font-medium">Skill</span>
              <Select value={value.skill} onValueChange={(skill) => update({ skill })}>
                <SelectTrigger
                  aria-label="Skill"
                  className="w-full data-[size=default]:h-11 pointer-fine:md:data-[size=default]:h-9"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SKILL}>None: follow the instructions</SelectItem>
                  {value.skill !== NO_SKILL && !skills.some(({ name }) => name === value.skill) && (
                    <SelectItem value={value.skill}>{skillLabel(value.skill)}</SelectItem>
                  )}
                  {skills.map(({ name }) => (
                    <SelectItem key={name} value={name}>
                      {skillLabel(name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {chosen?.description && (
                <span className="text-xs text-muted-foreground">
                  {skillSummary(chosen.description)}
                </span>
              )}
            </div>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">
                {value.skill === NO_SKILL ? "What should Ægentica do?" : "Extra instructions"}
              </span>
              <Textarea
                required={value.skill === NO_SKILL}
                maxLength={4000}
                rows={4}
                placeholder={
                  value.skill === NO_SKILL
                    ? "Check the weather in Stockholm and suggest what to wear."
                    : "Optional, for example: keep it under five bullet points."
                }
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
                <SelectTrigger
                  aria-label="Repeat"
                  className="w-full data-[size=default]:h-11 pointer-fine:md:data-[size=default]:h-9"
                >
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
                  className="h-11 font-mono pointer-fine:md:h-9"
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
                      className="h-11 pointer-fine:md:h-9"
                      value={value.date}
                      onChange={(event) => update({ date: event.target.value })}
                    />
                  </label>
                )}
                {value.repeat === "weekly" && (
                  <div className="grid gap-1.5 text-sm">
                    <span className="font-medium">Day</span>
                    <Select value={value.weekday} onValueChange={(weekday) => update({ weekday })}>
                      <SelectTrigger
                        aria-label="Day"
                        className="w-full data-[size=default]:h-11 pointer-fine:md:data-[size=default]:h-9"
                      >
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
                    className="h-11 pointer-fine:md:h-9"
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
              <Button
                type="button"
                variant="ghost"
                className="h-11 pointer-fine:md:h-9"
                onClick={onClose}
              >
                Cancel
              </Button>
              <Button type="submit" className="h-11 pointer-fine:md:h-9" disabled={saving}>
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
