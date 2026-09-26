"use client";
import type { UserContent } from "ai";
import { isModelId, pickModel } from "../model-catalog";
import { modelRequestHeaders, readModelPreference, setModelPreference } from "./model-preference";
import type { AgentProfile } from "../agent-profiles";
import { SKILL_HEADER } from "../skills";

export type ComposerDraft = {
  id: string;
  files: File[];
  profileId: string;
  profileName: string;
  /** Skill the next turn follows; "" lets the agent choose. */
  skill: string;
  updatedAt: number;
};
export const DRAFT_EVENT = "aegentica:draft-changed";
const MAX_BYTES = 6 * 1024 * 1024;
const empty = (id: string): ComposerDraft => ({
  id,
  files: [],
  profileId: "",
  profileName: "",
  skill: "",
  updatedAt: Date.now(),
});
/**
 * IndexedDB cannot be opened at all (site data blocked, some private windows):
 * nothing was ever stored, so reads find an empty draft and text still sends;
 * only attachments and agent or skill choices need the storage.
 */
class DraftStorageUnavailable extends Error {
  constructor() {
    super(
      "This browser blocks site storage, which attachments and agent or skill choices need. Allow it for this site; text messages send without it.",
    );
  }
}
let database: Promise<IDBDatabase> | undefined;
function db() {
  if (!database) {
    database = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = indexedDB.open("aegentica-composer", 1);
      } catch {
        // Blocked site data throws here (SecurityError) instead of failing the request.
        return reject(new DraftStorageUnavailable());
      }
      request.onupgradeneeded = () => request.result.createObjectStore("drafts", { keyPath: "id" });
      request.onsuccess = () => {
        // A connection the browser drops (storage cleared, Safari losing its
        // database server) is reopened on the next use instead of failing forever.
        request.result.onclose = () => {
          database = undefined;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(new DraftStorageUnavailable());
      request.onblocked = () => reject(new Error("Close other app tabs and retry."));
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  }
  return database;
}
/** Reads from the draft store; storage that cannot be opened at all holds `nothing`. */
async function orNothingStored<T>(work: () => Promise<T>, nothing: T): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof DraftStorageUnavailable) return nothing;
    throw error;
  }
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction("drafts", mode);
    const request = action(tx.objectStore("drafts"));
    tx.oncomplete = () => resolve(request.result);
    tx.onabort = tx.onerror = () =>
      reject(new Error("Could not save the draft. Check available device storage."));
  });
}
export function composerKey(path: string) {
  return path.startsWith("/chat/") ? path.slice(6) : "new";
}
export async function readComposerDraft(id: string): Promise<ComposerDraft> {
  const value = await orNothingStored(
    () => transaction<ComposerDraft | undefined>("readonly", (store) => store.get(id)),
    undefined,
  );
  return value ?? empty(id);
}
export async function updateComposerDraft(id: string, patch: Partial<Omit<ComposerDraft, "id">>) {
  const database = await db();
  const next = await new Promise<ComposerDraft>((resolve, reject) => {
    const tx = database.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    const get = store.get(id);
    let result: ComposerDraft;
    get.onsuccess = () => {
      result = { ...(get.result ?? empty(id)), ...patch, id, updatedAt: Date.now() };
      store.put(result);
    };
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () =>
      reject(new Error("Could not save the draft. Check available device storage."));
  });
  window.dispatchEvent(new CustomEvent(DRAFT_EVENT, { detail: id }));
  return next;
}
export async function moveComposerDraft(from: string, to: string) {
  const database = await orNothingStored(db, null);
  if (!database) return;
  await new Promise<void>((resolve, reject) => {
    const tx = database.transaction("drafts", "readwrite");
    const store = tx.objectStore("drafts");
    const get = store.get(from);
    get.onsuccess = () => {
      if (get.result) {
        store.put({ ...get.result, id: to });
        store.delete(from);
      }
    };
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () =>
      reject(new Error("Could not preserve attachments. Please retry."));
  });
  window.dispatchEvent(new Event(DRAFT_EVENT));
}
export async function chooseProfile(id: string, profile: AgentProfile | null) {
  await updateComposerDraft(id, { profileId: profile?.id ?? "", profileName: profile?.name ?? "" });
  if (profile?.model && isModelId(profile.model)) setModelPreference(profile.model);
}
/** File types a turn can carry; the service worker's share target mirrors it. */
export const ATTACHABLE = /^(image\/(png|jpeg|webp|gif)|application\/pdf|text\/[a-z0-9.+-]+)$/;
const TEXT_NAME = /\.(txt|md|markdown|csv|log)$/i;
/** Some systems leave plain-text files untyped; they attach as text. */
export function asAttachment(file: File) {
  if (file.type || !TEXT_NAME.test(file.name)) return file;
  return new File([file], file.name, { type: "text/plain", lastModified: file.lastModified });
}
export function validateFiles(files: File[]) {
  if (files.length > 4) throw new Error("Attach up to four files per message.");
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES)
    throw new Error("Attachments must total 6 MB or less.");
  for (const file of files) {
    if (!ATTACHABLE.test(file.type))
      throw new Error("Use PNG, JPEG, WebP, GIF, PDF or a plain-text file.");
    if (!file.size) throw new Error("Empty files cannot be attached.");
  }
}
function dataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}. Attach it again.`));
    reader.readAsDataURL(file);
  });
}
/** Per-turn choices the server turns into eve session attributes. */
export function composerHeaders(draft: ComposerDraft): Record<string, string> {
  const headers = modelRequestHeaders();
  if (draft.profileId) headers["x-aegentica-profile"] = draft.profileId;
  if (draft.skill) headers[SKILL_HEADER] = draft.skill;
  return headers;
}
export async function composerTurn(
  id: string,
  text: string,
): Promise<{ message: string | UserContent; headers: Record<string, string> }> {
  const draft = await readComposerDraft(id);
  validateFiles(draft.files);
  if (draft.files.some((file) => file.type.startsWith("image/"))) {
    const response = await fetch("/api/models", { cache: "no-store" });
    if (!response.ok)
      throw new Error("Cannot check image support. Retry or choose a vision model.");
    const catalog = await response.json();
    const model = pickModel(catalog.provider, catalog.models, readModelPreference());
    if (!model?.vision)
      throw new Error(
        "The selected model cannot read images. Choose a model marked Vision; your attachments are saved.",
      );
  }
  const headers = composerHeaders(draft);
  if (!draft.files.length) return { message: text, headers };
  const parts: UserContent = [{ type: "text", text }];
  for (const file of draft.files)
    parts.push({
      type: "file",
      data: await dataUrl(file),
      mediaType: file.type,
      filename: file.name,
    });
  return { message: parts, headers };
}
export async function clearComposerFiles(id: string) {
  await updateComposerDraft(id, { files: [] });
}
export async function clearComposerStorage() {
  await transaction("readwrite", (store) => store.clear());
  window.dispatchEvent(new Event(DRAFT_EVENT));
}
