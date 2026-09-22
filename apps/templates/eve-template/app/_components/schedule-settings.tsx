"use client";
import { useEffect, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";

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
};

function when(iso: string, timezone: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function describe(task: Task) {
  if (!task.enabled) return task.nextRunAt || task.cron ? "Paused" : "Done";
  const next = task.nextRunAt ? `Next ${when(task.nextRunAt, task.timezone)}` : "";
  return task.cron ? `${next} · repeats` : next;
}

export function ScheduleSettings() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function call(body?: Record<string, unknown>) {
    setError("");
    const response = await fetch("/api/settings/schedules", {
      method: body ? "POST" : "GET",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not complete the request.");
    setTasks(data.tasks);
  }
  useEffect(() => {
    call().catch((reason) => setError((reason as Error).message));
  }, []);

  async function act(action: "pause" | "resume" | "delete", id: string) {
    setBusy(`${action}:${id}`);
    try {
      await call({ action, id });
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="schedules-title" className="rounded-lg border bg-card p-4 sm:p-5">
      <h2 id="schedules-title" className="font-medium">
        Scheduled tasks
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Ask Ægentica in chat, for example “remind me every weekday at 8 to check my calendar”.
        Results arrive on Telegram.
      </p>
      {tasks === null ? (
        !error && <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No scheduled tasks yet.</p>
      ) : (
        <ul className="mt-4 divide-y rounded-md border">
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground">
                  {describe(task)}
                  {task.lastStatus === "failed" && " · last run failed, retrying"}
                </p>
              </div>
              {(task.enabled || task.nextRunAt || task.cron) && (
                <Button
                  variant="ghost"
                  className="h-11 px-2 md:h-9"
                  disabled={Boolean(busy)}
                  onClick={() => void act(task.enabled ? "pause" : "resume", task.id)}
                >
                  {busy === `${task.enabled ? "pause" : "resume"}:${task.id}` && (
                    <Loader2Icon className="size-4 animate-spin" />
                  )}
                  {task.enabled ? "Pause" : "Resume"}
                </Button>
              )}
              <Button
                variant="ghost"
                className="h-11 px-2 text-muted-foreground md:h-9"
                disabled={Boolean(busy)}
                onClick={() => void act("delete", task.id)}
              >
                {busy === `delete:${task.id}` && <Loader2Icon className="size-4 animate-spin" />}
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}
