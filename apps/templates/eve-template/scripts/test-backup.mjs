// The nightly backup (lib/backup.ts, run by agent/schedules/nightly-backup.ts):
// due once a night from 03:00 in the task time zone, writes readable copies of
// the chat and memory databases and the settings files into backups/<day>/
// with owner-only permissions, keeps seven nights, skips the chat database in
// Postgres mode, and never rotates out good copies after a failing night.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^(\.\.?\/|file:)/.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const directory = await mkdtemp(join(tmpdir(), "aegentica-backup-"));
process.env.EVE_MEMORY_DIR = join(directory, "profile-memory");
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.AEGENTICA_TIMEZONE = "Europe/Stockholm";
delete process.env.EVE_CHAT_DB_PATH;
delete process.env.EVE_SETTINGS_DIR;
delete process.env.DATABASE_URL;

const chats = await import("../lib/db/sqlite-queries.ts");
const memory = await import("../lib/memory-store.ts");
const settings = await import("../lib/secure-settings.ts");
const backups = await import("../lib/backup.ts");

const mode = async (path) => (await stat(path)).mode & 0o777;
// 03:17 in Stockholm on 26 September 2026 (summer time, UTC+2).
const night = (day) => new Date(Date.UTC(2026, 8, 26 + day, 1, 17));
const backupRoot = join(directory, "backups");

try {
  // State as the app leaves it: the chat and memory connections stay open, so
  // the newest writes are still in the WAL when the backup runs.
  const chat = await chats.createChat("eve-chat-user", { title: "Plans" });
  await chats.appendChatEvent({
    chatId: chat.id,
    event: { type: "message.received", data: { text: "Book the ferry" }, meta: { id: "1" } },
    eventIndex: 0,
    userId: "eve-chat-user",
  });
  memory.recordOperatorMemoryKey("operator-key");
  memory.addMemories(["Lives in Stockholm"]);
  await settings.writeEncrypted("gateway.enc", { apiKey: "vck_test" });
  await settings.writeJson("operator-password.json", { version: 1, digest: "d" });
  await settings.withSettingsLock("tasks", async () => {
    await writeFile(join(settings.settingsDirectory(), "tasks.enc.abc.tmp"), "half-written");
  });
  await mkdir(join(settings.settingsDirectory(), "tasks.lock"));

  assert.equal(backups.backupRoot(), backupRoot);
  assert.deepEqual(backups.localTime(night(0)), { day: "2026-09-26", hour: 3 });
  // Winter time (UTC+1): 03:17 local is 02:17 UTC.
  assert.deepEqual(backups.localTime(new Date(Date.UTC(2026, 11, 1, 2, 17))), {
    day: "2026-12-01",
    hour: 3,
  });
  assert.equal(await backups.isBackupDue(new Date(Date.UTC(2026, 8, 26, 0, 17))), false);
  assert.equal(await backups.isBackupDue(night(0)), true);

  const first = await backups.runBackup({ now: night(0) });
  const folder = join(backupRoot, "2026-09-26");
  assert.equal(first.directory, folder);
  assert.deepEqual(first.failed, []);
  assert.deepEqual(first.files.toSorted(), [
    "chats.sqlite",
    "profile.sqlite",
    "settings/gateway.enc",
    "settings/operator-password.json",
  ]);
  assert.equal(await backups.isBackupDue(night(0)), false, "one backup a night");
  assert.equal(await backups.isBackupDue(new Date(Date.UTC(2026, 8, 26, 21, 17))), false);

  // Owner-only: 0700 folders, 0600 files.
  assert.equal(await mode(backupRoot), 0o700);
  assert.equal(await mode(folder), 0o700);
  assert.equal(await mode(join(folder, "settings")), 0o700);
  for (const file of first.files) assert.equal(await mode(join(folder, file)), 0o600, file);

  // The copies are complete, standalone databases and decryptable settings.
  const chatCopy = new DatabaseSync(join(folder, "chats.sqlite"), { readOnly: true });
  assert.deepEqual(
    { ...chatCopy.prepare("SELECT title FROM chat WHERE id = ?").get(chat.id) },
    { title: "Plans" },
  );
  assert.match(
    String(chatCopy.prepare("SELECT event FROM chat_event").get().event),
    /Book the ferry/,
  );
  chatCopy.close();
  const memoryCopy = new DatabaseSync(join(folder, "profile.sqlite"), { readOnly: true });
  assert.match(
    String(memoryCopy.prepare("SELECT content FROM memory").get().content),
    /Lives in Stockholm/,
  );
  memoryCopy.close();
  assert.deepEqual(
    (await readdir(folder)).toSorted(),
    ["chats.sqlite", "profile.sqlite", "settings"],
    "no -wal or -shm files beside the copies",
  );
  process.env.EVE_SETTINGS_DIR = join(folder, "settings");
  assert.deepEqual(await settings.readEncrypted("gateway.enc"), { apiKey: "vck_test" });
  delete process.env.EVE_SETTINGS_DIR;

  // A second run the same day replaces that night's folder.
  memory.addMemories(["Has a Pixel 10"]);
  await backups.runBackup({ now: night(0) });
  const again = new DatabaseSync(join(folder, "profile.sqlite"), { readOnly: true });
  assert.match(String(again.prepare("SELECT content FROM memory").get().content), /Pixel 10/);
  again.close();

  // Seven nights are kept; an interrupted run's leftovers are cleared.
  await mkdir(join(backupRoot, ".2026-09-20.partial"));
  let removed = [];
  for (let day = 1; day <= 8; day++)
    removed.push(...(await backups.runBackup({ now: night(day) })).removed);
  const kept = (await readdir(backupRoot)).toSorted();
  assert.deepEqual(kept, [
    "2026-09-28",
    "2026-09-29",
    "2026-09-30",
    "2026-10-01",
    "2026-10-02",
    "2026-10-03",
    "2026-10-04",
  ]);
  assert.deepEqual(removed, ["2026-09-26", "2026-09-27"]);

  // A source that cannot be copied is reported, the rest is saved, and no
  // older night is removed.
  const broken = join(directory, "broken.sqlite");
  await writeFile(broken, "not a database ".repeat(100));
  const failing = await backups.runBackup({
    now: night(9),
    sources: { ...backups.backupSources(), memoryDatabase: broken },
  });
  assert.deepEqual(
    failing.failed.map((item) => item.name),
    ["profile.sqlite"],
  );
  assert(failing.files.includes("chats.sqlite"));
  assert.deepEqual(failing.removed, []);
  assert.equal((await readdir(backupRoot)).length, 8);

  // Postgres mode: the chat history is not on the volume.
  process.env.DATABASE_URL = "postgres://example.invalid/db";
  assert.equal(backups.backupSources().chatDatabase, undefined);
  const postgres = await backups.runBackup({ now: night(10) });
  assert(!postgres.files.includes("chats.sqlite"));
  assert(postgres.files.includes("profile.sqlite"));
  delete process.env.DATABASE_URL;

  console.log(
    "PASS: nightly backup due from 03:00 local once a night, readable owner-only copies of chats, memory and settings, seven nights kept, failures keep older copies, Postgres skips chats",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
