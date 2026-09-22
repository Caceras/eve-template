import { MODEL_HEADER, isModelId } from "../model-catalog";
const STORAGE_KEY = "aegentica-chat-model";
const RECENT_KEY = "aegentica-recent-models";
const CHANGE_EVENT = "aegentica-model-changed";
let inMemoryModel = "";
let inMemoryRecent: string[] = [];

/** The composer's model choice; "" means the active provider's default. */
export function readModelPreference(): string {
  if (typeof window === "undefined") return "";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isModelId(stored) ? stored : inMemoryModel;
  } catch {
    return inMemoryModel;
  }
}
export function readRecentModels(): string[] {
  try {
    const stored = JSON.parse(window.localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(stored) ? stored.filter(isModelId).slice(0, 5) : inMemoryRecent;
  } catch {
    return inMemoryRecent;
  }
}
export function setModelPreference(value: string) {
  if (!isModelId(value)) return;
  inMemoryModel = value;
  inMemoryRecent = [value, ...readRecentModels().filter((id) => id !== value)].slice(0, 5);
  try {
    window.localStorage.setItem(STORAGE_KEY, inMemoryModel);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(inMemoryRecent));
  } catch {
    /* Private browsing can disable storage. */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
/** Notifies model-choice and provider-switch listeners across components and tabs. */
export function notifyModelSettingsChanged() {
  window.dispatchEvent(new Event(CHANGE_EVENT));
}
export function subscribeModelPreference(listener: () => void) {
  window.addEventListener(CHANGE_EVENT, listener);
  window.addEventListener("storage", listener);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener("storage", listener);
  };
}
export function modelRequestHeaders(): Record<string, string> {
  const model = readModelPreference();
  return model ? { [MODEL_HEADER]: model } : {};
}
