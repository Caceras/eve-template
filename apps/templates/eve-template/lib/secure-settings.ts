import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
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
  await writeFile(temp, data, { mode: 0o600 });
  await rename(temp, join(directory, name));
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

/**
 * Serializes read-modify-write across the Next.js and eve processes with an
 * exclusive lock directory. A lock older than 30s belongs to a crashed writer.
 */
export async function withSettingsLock<T>(name: string, task: () => Promise<T>): Promise<T> {
  await mkdir(settingsDirectory(), { recursive: true, mode: 0o700 });
  const lock = join(settingsDirectory(), `${name}.lock`);
  const deadline = Date.now() + 10_000;
  while (true) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const age = await stat(lock).then(
        (info) => Date.now() - info.mtimeMs,
        () => 0,
      );
      if (age > LOCK_STALE_MS) await rmdir(lock).catch(() => {});
      else if (Date.now() > deadline) throw new Error("Settings are busy. Try again.");
      else await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }
  try {
    return await task();
  } finally {
    await rmdir(lock).catch(() => {});
  }
}
