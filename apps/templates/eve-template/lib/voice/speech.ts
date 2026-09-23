"use client";
import { readVoicePreferences, resolveLanguage } from "./preferences";

/** Markdown and URLs read badly aloud; speak the prose only. */
export function speakableText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, " (code block) ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#>*_`|~-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function speak(markdown: string, handlers: { onEnd?: () => void } = {}) {
  if (!canSpeak()) return;
  const preferences = readVoicePreferences();
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speakableText(markdown));
  const voice = window.speechSynthesis
    .getVoices()
    .find((item) => item.voiceURI === preferences.voice);
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? resolveLanguage(preferences.language);
  utterance.rate = preferences.rate;
  utterance.onend = () => handlers.onEnd?.();
  utterance.onerror = () => handlers.onEnd?.();
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (canSpeak()) window.speechSynthesis.cancel();
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult:
    | ((event: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function recognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  // Chrome and Safari still ship the prefixed name; neither is in the DOM types.
  return (Reflect.get(window, "SpeechRecognition") ??
    Reflect.get(window, "webkitSpeechRecognition")) as (new () => Recognition) | undefined;
}

export const canDictate = () => Boolean(recognitionConstructor());

/**
 * Browser speech-to-text (Chrome and Android use Google's recogniser, Safari
 * Apple's). Reports the full transcript so far on every result.
 */
export function startDictation(handlers: {
  onText: (text: string) => void;
  onEnd: (error?: string) => void;
  /** Stop after the first pause instead of listening until stopped. */
  singleUtterance?: boolean;
}) {
  const Constructor = recognitionConstructor();
  if (!Constructor) {
    handlers.onEnd("This browser does not support dictation.");
    return () => undefined;
  }
  const recognition = new Constructor();
  recognition.lang = resolveLanguage(readVoicePreferences().language);
  recognition.continuous = !handlers.singleUtterance;
  recognition.interimResults = true;
  const finals: string[] = [];
  let failure: string | undefined;
  recognition.onresult = (event) => {
    let interim = "";
    for (let index = event.resultIndex; index < event.results.length; index++) {
      const result = event.results[index]!;
      if (result.isFinal) finals[index] = result[0]!.transcript.trim();
      else interim += result[0]!.transcript;
    }
    handlers.onText([...finals.filter(Boolean), interim.trim()].filter(Boolean).join(" "));
  };
  recognition.onerror = (event) => {
    if (event.error === "not-allowed" || event.error === "service-not-allowed")
      failure = "Microphone access is blocked. Allow it in the browser's site settings.";
    else if (event.error !== "aborted" && event.error !== "no-speech")
      failure = "Dictation stopped because of a connection problem. Try again.";
  };
  recognition.onend = () => handlers.onEnd(failure);
  recognition.start();
  return () => recognition.stop();
}
