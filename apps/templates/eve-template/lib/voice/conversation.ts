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
  listeners.forEach((listener) => listener());
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
