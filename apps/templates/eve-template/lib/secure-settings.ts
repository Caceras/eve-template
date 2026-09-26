import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readlinkSync } from "node:fs";
import {
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  rmdir,
  stat,
  unlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import { dirname, join } from "node:path";

/**
 * Operator settings shared by the Next.js process (Settings UI) and the eve
 * process (agent runtime). Both run in one container with the same volume.
 */
export function settingsDirectory() {
  return (
    process.env.EVE_SETTINGS_DIR ||
    join(
      process.env.EVE_MEMORY_DIR ? dirname(process.env.EVE_MEMORY_DIR) : ".eve/.workflow-data",
      "settings",
    )
  );
}

function encryptionKey() {
  const secret = process.env.EVE_SESSION_SECRET?.trim();
  if (!secret) throw new Error("Settings encryption is not configured.");
  // The label predates other settings; changing it would orphan saved keys.
  return createHash("sha256")
    .update("aegentica/gateway/v1\0" + secret)
    .digest();
}

async function readRaw(name: string, maxBytes: number): Promise<string | undefined> {
  const file = join(settingsDirectory(), name);
  try {
    if ((await stat(file)).size > maxBytes) throw new Error("Invalid settings file.");
    return await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

async function atomicWrite(name: string, data: string) {
  const directory = settingsDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = join(directory, `${name}.${randomBytes(8).toString("hex")}.tmp`);
  try {
    const file = await open(temp, "wx", 0o600);
    try {
      await file.writeFile(data);
      // Flushed before the rename, so a power loss cannot leave an empty file in place.
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temp, join(directory, name));
  } catch (error) {
    await rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

/** Decrypts a settings file; undefined when absent, throws when tampered or unreadable. */
export async function readEncrypted(name: string, maxBytes = 8192): Promise<unknown> {
  const raw = await readRaw(name, maxBytes);
  if (raw === undefined) return undefined;
  const stored = JSON.parse(raw);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(stored.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
  return JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(stored.data, "base64")), decipher.final()]).toString(
      "utf8",
    ),
  );
}

export async function writeEncrypted(name: string, value: unknown) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  await atomicWrite(
    name,
    JSON.stringify({
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    }),
  );
}

export async function readJson(name: string, maxBytes = 8192): Promise<unknown> {
  const raw = await readRaw(name, maxBytes);
  return raw === undefined ? undefined : JSON.parse(raw);
}

export async function writeJson(name: string, value: unknown) {
  await atomicWrite(name, JSON.stringify(value));
}

export async function removeSetting(name: string) {
  await rm(join(settingsDirectory(), name), { force: true });
}

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 10_000;

// The process table this process shares with its siblings (the container's PID
// namespace on Linux), so a lock left by a sibling that has since died is free at once.
const PROCESS_SPACE = (() => {
  try {
    return `${hostname()}:${readlinkSync("/proc/self/ns/pid")}`;
  } catch {
    return hostname();
  }
})();

function isRunning(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** The lock's owner token, and whether that owner can no longer be holding it. */
async function lockOwner(lock: string) {
  const entries = await readdir(lock).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const token = entries[0];
  if (!token) return undefined;
  const file = join(lock, token);
  const info = await stat(file).catch(() => undefined);
  if (!info) return undefined;
  const owner = (await readFile(file, "utf8")
    .then(JSON.parse)
    .catch(() => ({}))) as { pid?: unknown; space?: unknown };
  const gone =
    owner.space === PROCESS_SPACE && typeof owner.pid === "number" && !isRunning(owner.pid);
  return { token, stale: gone || Date.now() - info.mtimeMs > LOCK_STALE_MS };
}

/**
 * Removes the lock only while `token` still owns it: unlinking the owner file
 * is the single step that can succeed for one caller, so two waiters breaking
 * the same stale lock never both win, and a stale lock is never confused with
 * the fresh one that replaced it.
 */
async function releaseLock(lock: string, token: string) {
  try {
    await unlink(join(lock, token));
  } catch {
    return;
  }
  // Fails harmlessly when a waiter has already claimed the emptied lock.
  await rmdir(lock).catch(() => {});
}

/**
 * Serializes read-modify-write across the Next.js and eve processes with an
 * exclusive lock directory holding one owner file (pid and process table). A
 * lock whose owner has exited, or that is older than 30s, belongs to a crashed
 * writer and is broken.
 */
export async function withSettingsLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  const directory = settingsDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, `${name}.lock`);
  const token = randomBytes(8).toString("hex");
  // The claim is complete before it becomes the lock: renaming a directory
  // only succeeds while nothing, or an empty directory, is in the way.
  const claim = join(directory, `${name}.lock.${token}.tmp`);
  let held = false;
  try {
    await mkdir(claim, { mode: 0o700 });
    await writeFile(
      join(claim, token),
      JSON.stringify({ pid: process.pid, space: PROCESS_SPACE }),
      { mode: 0o600 },
    );
    const deadline = Date.now() + LOCK_WAIT_MS;
    while (!held) {
      try {
        await rename(claim, lock);
        held = true;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOTEMPTY" && code !== "EEXIST") throw error;
        if (Date.now() > deadline) throw new Error("Settings are busy. Try again.");
        const owner = await lockOwner(lock);
        if (owner?.stale) await releaseLock(lock, owner.token);
        else await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
  } finally {
    if (!held) await rm(claim, { recursive: true, force: true }).catch(() => {});
  }
  // The lock ages from now, not from when this caller started waiting.
  const now = new Date();
  await utimes(join(lock, token), now, now).catch(() => {});
  try {
    return await task();
  } finally {
    await releaseLock(lock, token);
  }
}
