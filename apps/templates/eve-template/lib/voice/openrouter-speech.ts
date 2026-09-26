"use client";
import { splitSpeech, type SpeechChoice } from "./speech-models";

/**
 * Replies read aloud with an OpenRouter voice. The text goes to the server in
 * sentence-sized pieces (the first one short, so speech starts sooner); each
 * piece comes back as MP3 and plays through one shared audio element while
 * the next piece is already on its way.
 */
type SpeechState = { configured: boolean; speech: SpeechChoice | null };
const CHOICE_EVENT = "aegentica:speech-choice";
let stateRequest: Promise<SpeechState> | undefined;
let known: SpeechState | undefined;

async function fetchState(): Promise<SpeechState> {
  const response = await fetch("/api/voice/speech", { cache: "no-store" });
  if (response.status === 401) return { configured: false, speech: null };
  if (!response.ok) throw new Error("Voice unavailable");
  return (await response.json()) as SpeechState;
}

/** The voice the server reads replies with; null means this device's own voices. */
export function loadSpeechChoice(): Promise<SpeechChoice | null> {
  if (known) return Promise.resolve(known.speech);
  stateRequest ??= fetchState()
    .then((state) => (known = state))
    .catch((error) => {
      stateRequest = undefined;
      throw error;
    });
  return stateRequest.then((state) => state.speech);
}

/** Settings saved a voice: every open composer speaks with it from now on. */
export function rememberSpeechChoice(state: SpeechState) {
  known = state;
  window.dispatchEvent(new Event(CHOICE_EVENT));
}

export function forgetSpeechChoice() {
  known = undefined;
  stateRequest = undefined;
}

export function onSpeechChoiceChange(callback: () => void) {
  window.addEventListener(CHOICE_EVENT, callback);
  return () => window.removeEventListener(CHOICE_EVENT, callback);
}

// Phones only play audio that a tap started. The tap that sends a message (or
// starts a conversation) plays this silent clip through the element that later
// plays the reply, which unlocks it for playback the reply starts on its own.
const SILENCE =
  "data:audio/wav;base64,UklGRmQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YUAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA";
let audio: HTMLAudioElement | undefined;
let unlocked = false;
let unlocking = false;

function player() {
  if (!audio) {
    audio = new Audio();
    audio.preload = "auto";
  }
  return audio;
}

function unlock() {
  if (unlocked || unlocking || playing) return;
  const element = player();
  unlocking = true;
  element.src = SILENCE;
  element
    .play()
    .then(() => {
      element.pause();
      unlocked = true;
    })
    .catch(() => undefined)
    .finally(() => {
      unlocking = false;
    });
}

if (typeof document !== "undefined") {
  document.addEventListener("pointerdown", unlock, { capture: true, passive: true });
  document.addEventListener("keydown", unlock, { capture: true, passive: true });
}

export type SpeechHandlers = {
  onEnd?: () => void;
  onError?: (message: string) => void;
};

let playing: { readonly abort: AbortController; readonly urls: string[] } | null = null;

async function fetchPiece(
  text: string,
  choice: SpeechChoice | undefined,
  signal: AbortSignal,
): Promise<string> {
  const response = await fetch("/api/voice/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(choice ? { text, speech: choice } : { text }),
    signal,
  });
  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { error?: unknown } | null;
    throw new Error(
      typeof detail?.error === "string"
        ? detail.error
        : "The voice could not be fetched. Try again.",
    );
  }
  return URL.createObjectURL(await response.blob());
}

function playUrl(element: HTMLAudioElement, url: string, rate: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const done = () => {
      element.onended = element.onerror = null;
      signal.removeEventListener("abort", stop);
      resolve();
    };
    const stop = () => {
      element.onended = element.onerror = null;
      element.pause();
      resolve();
    };
    signal.addEventListener("abort", stop, { once: true });
    element.onended = done;
    element.onerror = () => {
      element.onended = element.onerror = null;
      signal.removeEventListener("abort", stop);
      reject(new Error("This browser could not play the voice."));
    };
    element.src = url;
    element.playbackRate = rate;
    element.play().catch((error: unknown) => {
      element.onended = element.onerror = null;
      signal.removeEventListener("abort", stop);
      reject(
        error instanceof DOMException && error.name === "NotAllowedError"
          ? new Error(
              "Tap Read aloud to hear the reply; this browser only plays audio after a tap.",
            )
          : new Error("This browser could not play the voice."),
      );
    });
  });
}

/**
 * Speaks the text with the server's voice (or `choice`, for Settings
 * previews). Resolves with `null` once speech has started, or the reason it
 * could not start, so the caller can fall back to the device's voice.
 */
export function speakWithOpenRouter(
  text: string,
  rate: number,
  handlers: SpeechHandlers,
  choice?: SpeechChoice,
): Promise<string | null> {
  stopOpenRouterSpeech();
  const pieces = splitSpeech(text);
  if (pieces.length === 0) {
    handlers.onEnd?.();
    return Promise.resolve(null);
  }
  const abort = new AbortController();
  const session = { abort, urls: [] as string[] };
  playing = session;
  const element = player();
  const fetches = new Map<number, Promise<string>>();
  const piece = (index: number) => {
    let request = fetches.get(index);
    if (!request && index < pieces.length) {
      request = fetchPiece(pieces[index]!, choice, abort.signal).then((url) => {
        session.urls.push(url);
        return url;
      });
      request.catch(() => undefined);
      fetches.set(index, request);
    }
    return request!;
  };
  const finish = () => {
    if (playing !== session) return;
    playing = null;
    for (const url of session.urls) URL.revokeObjectURL(url);
    handlers.onEnd?.();
  };

  return new Promise<string | null>((resolve) => {
    void (async () => {
      let first: string;
      try {
        first = await piece(0);
      } catch (error) {
        if (playing === session) playing = null;
        resolve(abort.signal.aborted ? null : (error as Error).message);
        return;
      }
      if (abort.signal.aborted) {
        resolve(null);
        return;
      }
      resolve(null);
      try {
        let url = first;
        for (let index = 0; index < pieces.length; index++) {
          if (abort.signal.aborted) break;
          void piece(index + 1);
          await playUrl(element, url, rate, abort.signal);
          if (index + 1 < pieces.length) url = await piece(index + 1);
        }
      } catch (error) {
        if (!abort.signal.aborted) handlers.onError?.((error as Error).message);
      }
      finish();
    })();
  });
}

export function stopOpenRouterSpeech() {
  const session = playing;
  if (!session) return;
  playing = null;
  session.abort.abort();
  audio?.pause();
  for (const url of session.urls) URL.revokeObjectURL(url);
}

export const isOpenRouterSpeaking = () => playing !== null;
