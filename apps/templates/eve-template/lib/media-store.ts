import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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

export async function saveMedia(data: Uint8Array, mediaType: string) {
  const extension = TYPES[mediaType as MediaType];
  if (!extension) throw new Error(`Unsupported media type ${mediaType}.`);
  if (data.byteLength > MAX_BYTES) throw new Error("The generated file is too large to keep.");
  const name = `${randomUUID()}.${extension}`;
  await mkdir(directory(), { recursive: true, mode: 0o700 });
  await writeFile(join(directory(), name), data, { mode: 0o600 });
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
