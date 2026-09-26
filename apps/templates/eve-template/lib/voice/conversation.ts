"use client";
import { useSyncExternalStore } from "react";

/**
 * Hands-free voice conversation: the composer listens and sends, the reply is
 * read aloud, and when it finishes the composer listens again. This module is
 * the shared switch and the "reply finished speaking" signal between the two.
 */
let active = false;
const listeners = new Set<() => void>();
const SPOKEN = "aegentica:reply-spoken";

export function setVoiceConversation(on: boolean) {
  active = on;
  void keepScreenAwake();
  listeners.forEach((listener) => listener());
}

// A hands-free conversation keeps the screen on, as a call does: a phone that
// dims and locks mid-conversation stops listening. The browser drops the lock
// whenever the app is hidden, so it is taken again on return.
let wakeLock: WakeLockSentinel | null = null;
let requesting = false;
let watchingVisibility = false;

async function keepScreenAwake() {
  if (!watchingVisibility && typeof document !== "undefined") {
    watchingVisibility = true;
    document.addEventListener("visibilitychange", () => void keepScreenAwake());
  }
  if (!active) {
    const lock = wakeLock;
    wakeLock = null;
    await lock?.release().catch(() => undefined);
    return;
  }
  if (requesting || (wakeLock && !wakeLock.released) || document.visibilityState !== "visible")
    return;
  requesting = true;
  // Absent in some browsers despite the DOM typings.
  const lock = await (navigator.wakeLock as WakeLock | undefined)
    ?.request("screen")
    .catch(() => null);
  requesting = false;
  if (!lock) return;
  if (active) wakeLock = lock;
  else await lock.release().catch(() => undefined);
}

export const isVoiceConversation = () => active;

export function useVoiceConversation() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    () => active,
    () => false,
  );
}

export function announceReplySpoken() {
  window.dispatchEvent(new Event(SPOKEN));
}

export function onReplySpoken(callback: () => void) {
  window.addEventListener(SPOKEN, callback);
  return () => window.removeEventListener(SPOKEN, callback);
}
