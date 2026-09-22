import { DEFAULT_MODEL, MODEL_HEADER, resolveChatModel, type ChatModelId } from "../model-catalog";
const STORAGE_KEY = "aegentica-chat-model";
const CHANGE_EVENT = "aegentica-model-changed";
let inMemoryModel: ChatModelId = DEFAULT_MODEL;
export function readModelPreference(): ChatModelId {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  try {
    return resolveChatModel(window.localStorage.getItem(STORAGE_KEY) ?? inMemoryModel);
  } catch {
    return inMemoryModel;
  }
}
export function setModelPreference(value: string) {
  inMemoryModel = resolveChatModel(value);
  try {
    window.localStorage.setItem(STORAGE_KEY, inMemoryModel);
  } catch {
    /* Private browsing can disable storage. */
  }
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
export function modelRequestHeaders() {
  return { [MODEL_HEADER]: readModelPreference() };
}
