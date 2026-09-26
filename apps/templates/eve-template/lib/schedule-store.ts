import { randomUUID } from "node:crypto";
import { Cron } from "croner";
import { readEncrypted, withSettingsLock, writeEncrypted } from "./secure-settings";
import { isSkillName } from "./skills";

/**
 * Operator-owned scheduled tasks, dispatched by `agent/schedules/scheduled-tasks.ts`
 * (eve's dynamic-scheduling pattern). Rows are encrypted because prompts can
 * hold personal details. One replica, so a file lock provides the atomic lease.
 */
const FILE = "schedules.enc";
const MAX_TASKS = 50;
/** Paused and finished tasks count too, so the file can never outgrow its read limit. */
const MAX_STORED_TASKS = 200;
const MAX_FILE_CHARS = 900_000;
const READ_LIMIT = 4_000_000;
const MIN_INTERVAL_MS = 15 * 60_000;
const RETRY_MS = 5 * 60_000;
const MAX_FAILURES = 3;
const KEEP_FINISHED_MS = 30 * 24 * 60 * 60_000;

export const DEFAULT_TIMEZONE = process.env.AEGENTICA_TIMEZONE?.trim() || "Europe/Stockholm";

export type ScheduledTask = {
  id: string;
  title: string;
  prompt: string;
  /** Skill each run follows, sent like the composer's choice. */
  skill?: string | null;
  /** Recurring tasks: 5-field cron evaluated in `timezone`. */
  cron: string | null;
  timezone: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: "sent" | "failed" | "waiting" | null;
  /** Chat holding the latest run's result. */
  lastChatId?: string | null;
  failures: number;
  /** A queued "Run now": one extra run that leaves the schedule as it is. */
  runNowAt?: string | null;
  runNowFailures?: number;
  createdAt: string;
  lease?: {
    token: string;
    until: number;
    manual?: boolean;
    /** When the run was claimed: a Run now pressed later is kept for another run. */
    claimedAt?: number;
    /** The scheduled time this run answers: a new time set during the run stands. */
    occurrence?: string | null;
    /** The eve session running it, so a restart attaches to it instead of running it twice. */
    sessionId?: string;
  };
};

export type TaskInput = {
  title: string;
  prompt: string;
  skill?: string | null;
  cron?: string | null;
  runAt?: string | null;
  timezone?: string;
};

export class ScheduleError extends Error {}

async function load(): Promise<ScheduledTask[]> {
  // Read more than is ever written, so a file from before the write cap still loads.
  const value = await readEncrypted(FILE, READ_LIMIT);
  return Array.isArray(value) ? (value as ScheduledTask[]) : [];
}

async function mutate<T>(
  change: (tasks: ScheduledTask[]) => T,
  options: { growing?: boolean } = {},
): Promise<T> {
  return withSettingsLock(FILE, async () => {
    const tasks = await load();
    const before = JSON.stringify(tasks);
    const result = change(tasks);
    const now = Date.now();
    const kept = tasks.filter(
      (task) =>
        task.enabled ||
        task.cron !== null ||
        !task.lastRunAt ||
        now - Date.parse(task.lastRunAt) < KEEP_FINISHED_MS,
    );
    const after = JSON.stringify(kept);
    // The dispatcher checks every minute; most ticks change nothing.
    if (after === before) return result;
    if (options.growing && after.length > MAX_FILE_CHARS)
      throw new ScheduleError("Tasks are full. Delete tasks you no longer need, then try again.");
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

const CRON_NICKNAME = /^@(yearly|annually|monthly|weekly|daily|hourly)$/i;
/** Enough upcoming runs to catch a short gap that only shows up later in the week. */
const INTERVAL_SAMPLE = 60;

/** Validates the schedule and returns its first run. */
function plan(input: { cron?: string | null; runAt?: string | null; timezone: string }, now: Date) {
  if (!validTimezone(input.timezone))
    throw new ScheduleError(`Unknown time zone "${input.timezone}".`);
  if (input.cron) {
    const invalid = new ScheduleError(`"${input.cron}" is not a valid 5-field cron expression.`);
    const cron = input.cron.trim();
    if (cron.split(/\s+/).length !== 5 && !CRON_NICKNAME.test(cron)) throw invalid;
    let runs: Date[];
    try {
      runs = new Cron(cron, { timezone: input.timezone, paused: true }).nextRuns(
        INTERVAL_SAMPLE,
        now,
      );
    } catch {
      throw invalid;
    }
    if (runs.length === 0) throw new ScheduleError("That schedule never runs.");
    for (let index = 1; index < runs.length; index += 1) {
      const gap = runs[index]!.getTime() - runs[index - 1]!.getTime();
      // croner lists the same instant twice at the spring clock change; it runs once.
      if (gap > 0 && gap < MIN_INTERVAL_MS)
        throw new ScheduleError("Recurring tasks can run at most every 15 minutes.");
    }
    return runs[0]!;
  }
  if (input.runAt) {
    const at = new Date(input.runAt);
    if (Number.isNaN(at.getTime()) || !/[zZ]|[+-]\d\d:?\d\d$/.test(input.runAt))
      throw new ScheduleError("runAt must be an ISO 8601 time with an explicit offset.");
    if (at.getTime() < now.getTime() - 60_000)
      throw new ScheduleError("That time has passed. Pick a later time.");
    return at;
  }
  throw new ScheduleError("Give either a cron expression or a one-time runAt.");
}

function skillOf(value: string | null | undefined) {
  const skill = value?.trim();
  if (!skill) return null;
  if (!isSkillName(skill)) throw new ScheduleError(`"${skill}" is not a skill name.`);
  return skill;
}

const publicTask = ({ lease: _lease, runNowFailures: _tries, ...task }: ScheduledTask) => task;

export async function listTasks() {
  return (await load()).map(publicTask);
}

export async function createTask(input: TaskInput, now = new Date()) {
  const title = input.title.trim().slice(0, 120);
  const prompt = input.prompt.trim().slice(0, 4000);
  const skill = skillOf(input.skill);
  if (!title || !(prompt || skill))
    throw new ScheduleError("A task needs a title and instructions or a skill.");
  const timezone = input.timezone?.trim() || DEFAULT_TIMEZONE;
  const first = plan({ cron: input.cron, runAt: input.runAt, timezone }, now);
  return mutate(
    (tasks) => {
      if (tasks.filter((task) => task.enabled).length >= MAX_TASKS)
        throw new ScheduleError(`You can have at most ${MAX_TASKS} active scheduled tasks.`);
      if (tasks.length >= MAX_STORED_TASKS)
        throw new ScheduleError(
          `You can keep at most ${MAX_STORED_TASKS} tasks. Delete paused or finished ones you no longer need.`,
        );
      const task: ScheduledTask = {
        id: randomUUID(),
        title,
        prompt,
        skill,
        cron: input.cron?.trim() || null,
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
    },
    { growing: true },
  );
}

export async function updateTask(
  id: string,
  patch: Partial<TaskInput> & { enabled?: boolean },
  now = new Date(),
) {
  return mutate(
    (tasks) => {
      const task = tasks.find((candidate) => candidate.id === id);
      if (!task) throw new ScheduleError("No scheduled task has that id.");
      if (patch.title !== undefined) task.title = patch.title.trim().slice(0, 120) || task.title;
      if (patch.skill !== undefined) task.skill = skillOf(patch.skill);
      if (patch.prompt !== undefined)
        task.prompt = patch.prompt.trim().slice(0, 4000) || (task.skill ? "" : task.prompt);
      if (!task.prompt && !task.skill)
        throw new ScheduleError("A task needs instructions or a skill.");
      const timing =
        patch.cron !== undefined || patch.runAt !== undefined || patch.timezone !== undefined;
      // A finished one-time task that gets a new time is scheduled again, not left paused.
      const finished = !task.enabled && task.nextRunAt === null;
      if (!timing && patch.enabled === true && !task.cron && task.nextRunAt) {
        if (Date.parse(task.nextRunAt) < now.getTime() - 60_000)
          throw new ScheduleError("That time has passed. Edit the task to pick a new time.");
      }
      if (timing || patch.enabled === true) {
        const cron = patch.cron !== undefined ? patch.cron : patch.runAt ? null : task.cron;
        const timezone = patch.timezone?.trim() || task.timezone;
        const runAt = patch.runAt ?? (cron ? null : task.nextRunAt);
        task.nextRunAt = plan({ cron, runAt, timezone }, now).toISOString();
        task.cron = cron?.trim() || null;
        task.timezone = timezone;
        task.failures = 0;
      }
      if (patch.enabled !== undefined) task.enabled = patch.enabled;
      else if (timing && finished) task.enabled = true;
      return publicTask(task);
    },
    { growing: true },
  );
}

export async function deleteTask(id: string) {
  return mutate((tasks) => {
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return false;
    tasks.splice(index, 1);
    return true;
  });
}

/**
 * Queues one extra run; the next dispatcher tick (within a minute) starts it.
 * The schedule is untouched: a paused task stays paused and a one-time task
 * still runs at its own time.
 */
export async function runTaskNow(id: string, now = new Date()) {
  return mutate((tasks) => {
    const task = tasks.find((candidate) => candidate.id === id);
    if (!task) throw new ScheduleError("No scheduled task has that id.");
    task.runNowAt = now.toISOString();
    task.runNowFailures = 0;
    return publicTask(task);
  });
}

/** Leases due tasks so overlapping minute ticks never dispatch the same run twice. */
export async function claimDue(options: { now: Date; limit: number; leaseForMs: number }) {
  const now = options.now.getTime();
  const scheduled = (task: ScheduledTask) =>
    task.enabled && task.nextRunAt !== null && Date.parse(task.nextRunAt) <= now;
  const manual = (task: ScheduledTask) => !!task.runNowAt && Date.parse(task.runNowAt) <= now;
  // A run whose session started before a restart is picked up again, due or not.
  const started = (task: ScheduledTask) => !!task.lease?.sessionId;
  return mutate((tasks) =>
    tasks
      .filter(
        (task) =>
          (started(task) || scheduled(task) || manual(task)) &&
          (!task.lease || task.lease.until < now),
      )
      .slice(0, options.limit)
      .map((task) => {
        const lease = { token: randomUUID(), until: now + options.leaseForMs };
        task.lease = started(task)
          ? { ...task.lease, ...lease }
          : // A due scheduled run also answers a queued Run now.
            { ...lease, manual: !scheduled(task), claimedAt: now, occurrence: task.nextRunAt };
        return { ...task };
      }),
  );
}

/** Records the eve session a claimed run started, so a restart attaches to it. */
export async function recordRunSession(job: ScheduledTask, sessionId: string) {
  await mutate((tasks) => {
    const task = tasks.find((candidate) => candidate.id === job.id);
    if (task?.lease && task.lease.token === job.lease?.token) task.lease.sessionId = sessionId;
  });
}

export async function completeRun(
  job: ScheduledTask,
  result: { chatId?: string; failed?: boolean; waiting?: boolean } = {},
  now = new Date(),
) {
  await mutate((tasks) => {
    const task = tasks.find((candidate) => candidate.id === job.id);
    if (!task?.lease || task.lease.token !== job.lease?.token) return;
    const lease = task.lease;
    delete task.lease;
    task.lastRunAt = now.toISOString();
    // A run that reached the model is not retried; its chat shows the error.
    task.lastStatus = result.failed ? "failed" : result.waiting ? "waiting" : "sent";
    if (result.chatId) task.lastChatId = result.chatId;
    // This run answered a Run now queued before it started; one pressed during it still runs.
    if (
      !task.runNowAt ||
      lease.claimedAt === undefined ||
      Date.parse(task.runNowAt) <= lease.claimedAt
    ) {
      task.runNowAt = null;
      task.runNowFailures = 0;
    }
    if (lease.manual) return;
    task.failures = 0;
    // A new time set while the run was in flight stands.
    const occurrence = lease.occurrence === undefined ? job.nextRunAt : lease.occurrence;
    if (task.nextRunAt !== occurrence) return;
    const next = task.cron ? nextCronRun(task.cron, task.timezone, now) : null;
    task.nextRunAt = next?.toISOString() ?? null;
    if (!next) task.enabled = false;
  });
}

export async function releaseRun(job: ScheduledTask, now = new Date()) {
  await mutate((tasks) => {
    const task = tasks.find((candidate) => candidate.id === job.id);
    if (!task || task.lease?.token !== job.lease?.token) return;
    const manual = task.lease?.manual;
    delete task.lease;
    task.lastRunAt = now.toISOString();
    task.lastStatus = "failed";
    if (manual) {
      const tries = (task.runNowFailures ?? 0) + 1;
      task.runNowFailures = tries;
      task.runNowAt =
        tries < MAX_FAILURES ? new Date(now.getTime() + RETRY_MS).toISOString() : null;
      return;
    }
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
