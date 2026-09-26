"use client";
// The text being typed survives Android closing the app in the background, a
// reload or a crash, as a native app's draft does. One entry per composer
// ("new" or a chat id) in this device's storage; sending clears it and
// signing out clears them all. Attachments have their own store
// (composer-draft.ts).

const PREFIX = "aegentica:draft:";

export function readDraftText(key: string) {
  try {
    return window.localStorage.getItem(PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

export function saveDraftText(key: string, text: string) {
  try {
    if (text.trim()) window.localStorage.setItem(PREFIX + key, text);
    else window.localStorage.removeItem(PREFIX + key);
  } catch {
    // Storage full or blocked: the draft lives only in memory, as before.
  }
}

export function clearDraftTexts() {
  try {
    for (const key of Object.keys(window.localStorage))
      if (key.startsWith(PREFIX)) window.localStorage.removeItem(key);
  } catch {}
}
