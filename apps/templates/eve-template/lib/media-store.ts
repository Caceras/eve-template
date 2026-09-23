import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, opendir, stat, rm } from "node:fs/promises";
import { join } from "node:path";
import { settingsDirectory } from "./secure-settings";

/**
 * Generated media (images) on the persistent volume, next to the settings, so
 * chats can show them again after a reload or on another device.
 */
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;
export type MediaType = keyof typeof TYPES;
const MAX_BYTES = 20 * 1024 * 1024;
const NAME = /^[0-9a-f-]{36}\.(png|jpg|webp)$/;

const directory = () => join(settingsDirectory(), "..", "media");

export async function saveMedia(
  data: Uint8Array,
  mediaType: string,
  metadata?: { prompt: string; model: string },
) {
  const extension = TYPES[mediaType as MediaType];
  if (!extension) throw new Error(`Unsupported media type ${mediaType}.`);
  if (data.byteLength > MAX_BYTES) throw new Error("The generated file is too large to keep.");
  const name = `${randomUUID()}.${extension}`;
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  await writeFile(join(directory(), name), data, { mode: 0o600 });
  if (metadata)
    await writeFile(
      join(directory(), `${name}.json`),
      JSON.stringify({
        prompt: metadata.prompt.slice(0, 4000),
        model: metadata.model.slice(0, 200),
      }),
      { mode: 0o600 },
    );
  return { name, url: `/api/media/${name}` };
}

export async function readMedia(name: string) {
  if (!NAME.test(name)) return undefined;
  const extension = name.split(".").pop();
  const mediaType = (Object.keys(TYPES) as MediaType[]).find((type) => TYPES[type] === extension)!;
  try {
    return { data: await readFile(join(directory(), name)), mediaType };
  } catch {
    return undefined;
  }
}

export type MediaItem = {
  name: string;
  url: string;
  bytes: number;
  createdAt: string;
  prompt?: string;
  model?: string;
};
/** Bounded scan, deterministic newest-first pages. Never follows links or returns arbitrary files. */
export async function listMedia(
  offset = 0,
): Promise<{ images: MediaItem[]; next: number | null; truncated: boolean }> {
  const files: MediaItem[] = [];
  let truncated = false;
  let scanned = 0;
  try {
    const folder = await opendir(directory());
    for await (const entry of folder) {
      if (++scanned > 3000) {
        truncated = true;
        break;
      }
      if (!entry.isFile() || !NAME.test(entry.name)) continue;
      if (files.length >= 1000) {
        truncated = true;
        break;
      }
      const info = await stat(join(directory(), entry.name)).catch(() => null);
      if (!info) continue;
      const item: MediaItem = {
        name: entry.name,
        url: `/api/media/${entry.name}`,
        bytes: info.size,
        createdAt: info.birthtime.toISOString(),
      };
      try {
        const path = join(directory(), `${entry.name}.json`);
        if ((await stat(path)).size < 24_000) {
          const metadata = JSON.parse(await readFile(path, "utf8"));
          if (typeof metadata.prompt === "string") item.prompt = metadata.prompt.slice(0, 4000);
          if (typeof metadata.model === "string") item.model = metadata.model.slice(0, 200);
        }
      } catch {
        /* Older images have no metadata. */
      }
      files.push(item);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  files.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.name.localeCompare(b.name));
  return {
    images: files.slice(offset, offset + 48),
    next: offset + 48 < files.length ? offset + 48 : null,
    truncated,
  };
}
export async function deleteMedia(name: string) {
  if (!NAME.test(name)) return false;
  await rm(join(directory(), name), { force: true });
  await rm(join(directory(), `${name}.json`), { force: true });
  return true;
}
