import { chmod, copyFile, mkdir, readdir, rename, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";
import { chatDatabasePath } from "@/lib/db/sqlite-queries";
import { settingsDirectory } from "@/lib/secure-settings";

/**
 * Nightly copies of the state that exists only on the volume: the chat and
 * memory databases (consistent SQLite snapshots taken while the app runs) and
 * the settings files (encrypted keys, tokens, tasks, saved agents and the
 * password record). Each night is one folder, `backups/<YYYY-MM-DD>/` in the
 * volume's root, and the last seven are kept. Run by
 * `agent/schedules/nightly-backup.ts`.
 */
export const BACKUP_KEEP_DAYS = 7;
/** Local hour (in the task time zone) from which the night's backup is due. */
export const BACKUP_HOUR = 3;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
// All pages in one step: the copy holds one read snapshot instead of restarting
// whenever the other process writes (WAL readers never block writers).
const ALL_PAGES = 0x7fffffff;

export type BackupSources = {
  /** Chat history; unset in Postgres mode, where the database is not on the volume. */
  readonly chatDatabase?: string;
  /** eve's long-term memory; unset when memory is off. */
  readonly memoryDatabase?: string;
  readonly settingsDirectory?: string;
};

export type BackupOptions = {
  readonly now?: Date;
  readonly root?: string;
  readonly keep?: number;
  readonly timeZone?: string;
  readonly sources?: BackupSources;
};

export type BackupResult = {
  readonly day: string;
  readonly directory: string;
  readonly files: string[];
  readonly failed: { name: string; error: string }[];
  readonly removed: string[];
};

export function backupTimeZone() {
  return process.env.AEGENTICA_TIMEZONE?.trim() || "Europe/Stockholm";
}

/** `backups/` in the volume's root, beside `settings/` and `chats.sqlite`. */
export function backupRoot() {
  const memoryDirectory = process.env.EVE_MEMORY_DIR?.trim();
  return join(memoryDirectory ? dirname(memoryDirectory) : ".eve/.workflow-data", "backups");
}

export function backupSources(): BackupSources {
  const memoryDirectory = process.env.EVE_MEMORY_DIR?.trim();
  return {
    // Same test as isDatabaseConfigured(): with DATABASE_URL chats live in Postgres.
    chatDatabase: process.env.DATABASE_URL?.trim() ? undefined : chatDatabasePath(),
    memoryDatabase: memoryDirectory ? join(memoryDirectory, "profile.sqlite") : undefined,
    settingsDirectory: settingsDirectory(),
  };
}

/** The calendar day and hour at `now` in `timeZone`. */
export function localTime(now: Date, timeZone = backupTimeZone()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  );
  return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) };
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );

/** Due from 03:00 local time until tonight's folder exists, so a missed night catches up. */
export async function isBackupDue(
  now = new Date(),
  { root = backupRoot(), timeZone = backupTimeZone() } = {},
) {
  const { day, hour } = localTime(now, timeZone);
  return hour >= BACKUP_HOUR && !(await exists(join(root, day)));
}

async function copyDatabase(source: string, target: string) {
  const database = new DatabaseSync(source, { readOnly: true, timeout: 5000 });
  try {
    await backup(database, target, { rate: ALL_PAGES });
  } finally {
    database.close();
  }
  // A self-contained file: rollback-journal mode, so opening the copy never
  // needs or leaves -wal/-shm files. The app switches it back to WAL on restore.
  const copy = new DatabaseSync(target);
  try {
    copy.exec("PRAGMA journal_mode = DELETE");
    if (copy.prepare("PRAGMA quick_check").get()?.quick_check !== "ok")
      throw new Error("The copy failed its integrity check.");
  } finally {
    copy.close();
  }
  await chmod(target, 0o600);
}

async function copySettings(source: string, target: string) {
  const entries = await readdir(source, { withFileTypes: true }).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  );
  // Settings are replaced by rename, so each file is copied whole. Locks are
  // directories and half-written files end in .tmp; neither is state.
  const files = entries.filter((entry) => entry.isFile() && !entry.name.endsWith(".tmp"));
  if (files.length === 0) return [];
  await mkdir(target, { mode: 0o700 });
  for (const file of files) {
    await copyFile(join(source, file.name), join(target, file.name));
    await chmod(join(target, file.name), 0o600);
  }
  return files.map((file) => `settings/${file.name}`);
}

/** Removes all but the newest `keep` nightly folders; returns the removed days. */
export async function pruneBackups(root = backupRoot(), keep = BACKUP_KEEP_DAYS) {
  const days = (await readdir(root, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && DAY.test(entry.name))
    .map((entry) => entry.name)
    .toSorted()
    .toReversed();
  const removed = days.slice(keep);
  for (const day of removed) await rm(join(root, day), { recursive: true, force: true });
  return removed;
}

/**
 * Writes tonight's folder (replacing one already taken today). The folder is
 * built under a hidden name and renamed when done, so a dated folder is always
 * finished. A source that cannot be copied is reported in `failed` and older
 * backups are then kept, so a failing night never rotates out good copies.
 */
export async function runBackup({
  now = new Date(),
  root = backupRoot(),
  keep = BACKUP_KEEP_DAYS,
  timeZone = backupTimeZone(),
  sources = backupSources(),
}: BackupOptions = {}): Promise<BackupResult> {
  const { day } = localTime(now, timeZone);
  await mkdir(root, { recursive: true, mode: 0o700 });
  await chmod(root, 0o700);
  // Leftovers of a run that was interrupted (container stopped mid-copy).
  for (const entry of await readdir(root))
    if (entry.startsWith(".") && entry.endsWith(".partial"))
      await rm(join(root, entry), { recursive: true, force: true });

  const work = join(root, `.${day}.partial`);
  await mkdir(work, { mode: 0o700 });
  const files: string[] = [];
  const failed: BackupResult["failed"] = [];
  const attempt = async (name: string, task: () => Promise<string[]>) => {
    try {
      files.push(...(await task()));
    } catch (error) {
      failed.push({ name, error: error instanceof Error ? error.message : String(error) });
    }
  };
  for (const [name, source] of [
    ["chats.sqlite", sources.chatDatabase],
    ["profile.sqlite", sources.memoryDatabase],
  ] as const) {
    if (!source || !(await exists(source))) continue;
    await attempt(name, async () => {
      await copyDatabase(source, join(work, name));
      return [name];
    });
  }
  if (sources.settingsDirectory) {
    const settings = sources.settingsDirectory;
    await attempt("settings", () => copySettings(settings, join(work, "settings")));
  }

  const directory = join(root, day);
  await rm(directory, { recursive: true, force: true });
  await rename(work, directory);
  const removed = failed.length === 0 ? await pruneBackups(root, keep) : [];
  return { day, directory, files, failed, removed };
}
