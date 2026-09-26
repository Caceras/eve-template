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

function mediaTypeOf(name: string) {
  const extension = name.split(".").pop();
  return (Object.keys(TYPES) as MediaType[]).find((type) => TYPES[type] === extension)!;
}

export async function readMedia(name: string) {
  if (!NAME.test(name)) return undefined;
  try {
    return { data: await readFile(join(directory(), name)), mediaType: mediaTypeOf(name) };
  } catch {
    return undefined;
  }
}

/** Size and modification time, for cache validation without reading the file. */
export async function statMedia(name: string) {
  if (!NAME.test(name)) return undefined;
  try {
    const info = await stat(join(directory(), name));
    return info.isFile()
      ? { bytes: info.size, modified: info.mtimeMs, mediaType: mediaTypeOf(name) }
      : undefined;
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

const PAGE_SIZE = 48;
const MAX_LISTED = 1000;
const MAX_SCANNED = 20_000;

/**
 * Newest-first pages of the newest 1,000 images. Every image file is dated
 * before sorting (up to a 20,000-entry safety bound), since directory order
 * says nothing about age. `next` counts the listed images older than the page,
 * so an image created or deleted while paging does not shift later pages; only
 * past 1,000 images can a new one push the oldest out and repeat an item.
 * Never follows links or returns arbitrary files.
 */
export async function listMedia(
  offset = 0,
): Promise<{ images: MediaItem[]; next: number | null; truncated: boolean }> {
  const names: string[] = [];
  let truncated = false;
  try {
    let scanned = 0;
    const folder = await opendir(directory());
    for await (const entry of folder) {
      if (++scanned > MAX_SCANNED) {
        truncated = true;
        break;
      }
      if (entry.isFile() && NAME.test(entry.name)) names.push(entry.name);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const files: { name: string; bytes: number; modified: number }[] = [];
  for (let start = 0; start < names.length; start += 100)
    await Promise.all(
      names.slice(start, start + 100).map(async (name) => {
        const info = await stat(join(directory(), name)).catch(() => null);
        if (info) files.push({ name, bytes: info.size, modified: info.mtimeMs });
      }),
    );
  // Files are written once, so the modification time is when the image was made.
  files.sort((a, b) => b.modified - a.modified || a.name.localeCompare(b.name));
  if (files.length > MAX_LISTED) truncated = true;
  const listed = files.slice(0, MAX_LISTED);
  const older = offset === 0 ? listed.length : Math.min(offset, listed.length);
  const page = listed.slice(listed.length - older, listed.length - older + PAGE_SIZE);
  const images = await Promise.all(
    page.map(async (file) => {
      const item: MediaItem = {
        name: file.name,
        url: `/api/media/${file.name}`,
        bytes: file.bytes,
        createdAt: new Date(file.modified).toISOString(),
      };
      try {
        const path = join(directory(), `${file.name}.json`);
        if ((await stat(path)).size < 24_000) {
          const metadata = JSON.parse(await readFile(path, "utf8"));
          if (typeof metadata.prompt === "string") item.prompt = metadata.prompt.slice(0, 4000);
          if (typeof metadata.model === "string") item.model = metadata.model.slice(0, 200);
        }
      } catch {
        /* Older images have no metadata. */
      }
      return item;
    }),
  );
  return { images, next: older > PAGE_SIZE ? older - PAGE_SIZE : null, truncated };
}
export async function deleteMedia(name: string) {
  if (!NAME.test(name)) return false;
  await rm(join(directory(), name), { force: true });
  await rm(join(directory(), `${name}.json`), { force: true });
  return true;
}
