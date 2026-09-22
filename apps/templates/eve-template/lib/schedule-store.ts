import { randomUUID } from "node:crypto";
import { Cron } from "croner";
import { readEncrypted, withSettingsLock, writeEncrypted } from "./secure-settings";

/**
 * Operator-owned scheduled tasks, dispatched by `agent/schedules/scheduled-tasks.ts`
 * (eve's dynamic-scheduling pattern). Rows are encrypted because prompts can
 * hold personal details. One replica, so a file lock provides the atomic lease.
 */
const FILE = "schedules.enc";
const MAX_TASKS = 50;
const MIN_INTERVAL_MS = 15 * 60_000;
const RETRY_MS = 5 * 60_000;
const MAX_FAILURES = 3;
const KEEP_FINISHED_MS = 30 * 24 * 60 * 60_000;

export const DEFAULT_TIMEZONE = process.env.AEGENTICA_TIMEZONE?.trim() || "Europe/Stockholm";

export type ScheduledTask = {
  id: string;
  title: string;
  prompt: string;
  /** Recurring tasks: 5-field cron evaluated in `timezone`. */
  cron: string | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "sent" | "failed" | null;
  failures: number;
  createdAt: string;
  lease?: { token: string; until: number };
};

export type TaskInput = {
  title: string;
  prompt: string;
  cron?: string | null;
  runAt?: string | null;
  timezone?: string;
};

export class ScheduleError extends Error {}

async function load(): Promise<ScheduledTask[]> {
  const value = await readEncrypted(FILE, 1_000_000);
  return Array.isArray(value) ? (value as ScheduledTask[]) : [];
}

async function mutate<T>(change: (tasks: ScheduledTask[]) => T): Promise<T> {
  return withSettingsLock(FILE, async () => {
    const tasks = await load();
    const result = change(tasks);
    const now = Date.now();
    const kept = tasks.filter(
      (task) =>
        task.enabled ||
        task.cron !== null ||
        !task.lastRunAt ||
        now - Date.parse(task.lastRunAt) < KEEP_FINISHED_MS,
    );
    await writeEncrypted(FILE, kept);
    return result;
  });
}

function validTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function nextCronRun(cron: string, timezone: string, after: Date) {
  return new Cron(cron, { timezone, paused: true }).nextRun(after);
}

/** Validates the schedule and returns its first run. */
function plan(input: { cron?: string | null; runAt?: string | null; timezone: string }, now: Date) {
  if (!validTimezone(input.timezone))
    throw new ScheduleError(`Unknown time zone "${input.timezone}".`);
  if (input.cron) {
    let runs: Date[];
    try {
      runs = new Cron(input.cron, { timezone: input.timezone, paused: true }).nextRuns(2, now);
    } catch {
      throw new ScheduleError(`"${input.cron}" is not a valid 5-field cron expression.`);
    }
    if (runs.length === 0) throw new ScheduleError("That schedule never runs.");
    if (runs.length === 2 && runs[1]!.getTime() - runs[0]!.getTime() < MIN_INTERVAL_MS)
      throw new ScheduleError("Recurring tasks can run at most every 15 minutes.");
    return runs[0]!;
  }
  if (input.runAt) {
    const at = new Date(input.runAt);
    if (Number.isNaN(at.getTime()) || !/[zZ]|[+-]\d\d:?\d\d$/.test(input.runAt))
      throw new ScheduleError("runAt must be an ISO 8601 time with an explicit offset.");
    if (at.getTime() < now.getTime() - 60_000) throw new ScheduleError("That time has passed.");
    return at;
  }
  throw new ScheduleError("Give either a cron expression or a one-time runAt.");
}

const publicTask = ({ lease: _lease, ...task }: ScheduledTask) => task;

export async function listTasks() {
  return (await load()).map(publicTask);
}

export async function createTask(input: TaskInput, now = new Date()) {
  const title = input.title.trim().slice(0, 120);
  const prompt = input.prompt.trim().slice(0, 4000);
  if (!title || !prompt) throw new ScheduleError("A task needs a title and instructions.");
  const timezone = input.timezone?.trim() || DEFAULT_TIMEZONE;
  const first = plan({ cron: input.cron, runAt: input.runAt, timezone }, now);
  return mutate((tasks) => {
    if (tasks.filter((task) => task.enabled).length >= MAX_TASKS)
      throw new ScheduleError(`You can have at most ${MAX_TASKS} active scheduled tasks.`);
    const task: ScheduledTask = {
      id: randomUUID(),
      title,
      prompt,
      cron: input.cron || null,
      timezone,
      enabled: true,
      nextRunAt: first.toISOString(),
      lastRunAt: null,
      lastStatus: null,
      failures: 0,
      createdAt: now.toISOString(),
    };
    tasks.push(task);
    return publicTask(task);
  });
}

export async function updateTask(
  id: string,
  patch: Partial<TaskInput> & { enabled?: boolean },
  now = new Date(),
) {
  return mutate((tasks) => {
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task) throw new ScheduleError("No scheduled task has that id.");
    if (patch.title !== undefined) task.title = patch.title.trim().slice(0, 120) || task.title;
    if (patch.prompt !== undefined) task.prompt = patch.prompt.trim().slice(0, 4000) || task.prompt;
    const timing =
      patch.cron !== undefined || patch.runAt !== undefined || patch.timezone !== undefined;
    if (timing || patch.enabled === true) {
      const cron = patch.cron !== undefined ? patch.cron : patch.runAt ? null : task.cron;
      const timezone = patch.timezone?.trim() || task.timezone;
      const runAt = patch.runAt ?? (cron ? null : task.nextRunAt);
      task.nextRunAt = plan({ cron, runAt, timezone }, now).toISOString();
      task.cron = cron || null;
      task.timezone = timezone;
      task.failures = 0;
    }
    if (patch.enabled !== undefined) task.enabled = patch.enabled;
    return publicTask(task);
  });
}

export async function deleteTask(id: string) {
  return mutate((tasks) => {
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return false;
    tasks.splice(index, 1);
    return true;
  });
}

/** Leases due tasks so overlapping minute ticks never dispatch the same run twice. */
export async function claimDue(options: { now: Date; limit: number; leaseForMs: number }) {
  const now = options.now.getTime();
  return mutate((tasks) =>
    tasks
      .filter(
        (task) =>
          task.enabled &&
          task.nextRunAt !== null &&
          Date.parse(task.nextRunAt) <= now &&
          (!task.lease || task.lease.until < now),
      )
      .slice(0, options.limit)
      .map((task) => {
        task.lease = { token: randomUUID(), until: now + options.leaseForMs };
        return { ...task };
      }),
  );
}

export async function completeRun(job: ScheduledTask, now = new Date()) {
  await mutate((tasks) => {
    const task = tasks.find((candidate) => candidate.id === job.id);
    if (!task || task.lease?.token !== job.lease?.token) return;
    delete task.lease;
    task.lastRunAt = now.toISOString();
    task.lastStatus = "sent";
    task.failures = 0;
    const next = task.cron ? nextCronRun(task.cron, task.timezone, now) : null;
    task.nextRunAt = next?.toISOString() ?? null;
    if (!next) task.enabled = false;
  });
}

export async function releaseRun(job: ScheduledTask, now = new Date()) {
  await mutate((tasks) => {
    const task = tasks.find((candidate) => candidate.id === job.id);
    if (!task || task.lease?.token !== job.lease?.token) return;
    delete task.lease;
    task.lastRunAt = now.toISOString();
    task.lastStatus = "failed";
    task.failures += 1;
    if (task.failures < MAX_FAILURES) {
      task.nextRunAt = new Date(now.getTime() + RETRY_MS).toISOString();
      return;
    }
    // Give up on this occurrence; a recurring task resumes at its next slot.
    const next = task.cron ? nextCronRun(task.cron, task.timezone, now) : null;
    task.failures = 0;
    task.nextRunAt = next?.toISOString() ?? null;
    if (!next) task.enabled = false;
  });
}
