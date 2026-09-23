"use client";
import { useSyncExternalStore } from "react";

/**
 * Voice preferences are per device (like a microphone choice), so they live in
 * this browser's storage rather than on the server.
 */
export type VoicePreferences = {
  /** BCP 47 tag, or "auto" for the browser's language. */
  language: string;
  /** SpeechSynthesisVoice.voiceURI, or "" for the system default. */
  voice: string;
  /** Speak each new reply when it finishes. */
  readReplies: boolean;
  /** 0.5–2, 1 is normal speed. */
  rate: number;
};

const KEY = "aegentica:voice";
const EVENT = "aegentica:voice-change";
export const DEFAULT_VOICE: VoicePreferences = {
  language: "auto",
  voice: "",
  readReplies: false,
  rate: 1,
};

let cached: { raw: string | null; value: VoicePreferences } | undefined;

export function readVoicePreferences(): VoicePreferences {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    // Storage can be blocked; fall back to defaults.
  }
  if (cached?.raw === raw) return cached.value;
  let value = DEFAULT_VOICE;
  try {
    if (raw) value = { ...DEFAULT_VOICE, ...(JSON.parse(raw) as Partial<VoicePreferences>) };
  } catch {
    value = DEFAULT_VOICE;
  }
  cached = { raw, value };
  return value;
}

export function saveVoicePreferences(patch: Partial<VoicePreferences>) {
  const next = { ...readVoicePreferences(), ...patch };
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Keeps working for this page even without storage.
  }
  cached = { raw: JSON.stringify(next), value: next };
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(callback: () => void) {
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useVoicePreferences() {
  return useSyncExternalStore(subscribe, readVoicePreferences, () => DEFAULT_VOICE);
}

export function resolveLanguage(language: string) {
  return language === "auto" ? navigator.language || "en-US" : language;
}
