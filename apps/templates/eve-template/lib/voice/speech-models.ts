/**
 * OpenRouter's text-to-speech models (`GET /api/v1/models?output_modalities=speech`),
 * normalized for the Voice settings and the speech route. Shared by the server
 * (catalog, validation) and the browser (the picker), so nothing here touches
 * either environment.
 */
export type SpeechModel = {
  id: string;
  name: string;
  /** Voice ids the model accepts; empty when it only has a default voice. */
  voices: string[];
  /** What the model is good at, in one line. */
  note: string;
  /** Human price line, e.g. "$9 per million characters". */
  price: string;
  recommended: boolean;
};

export type SpeechChoice = {
  model: string;
  voice: string;
};

export const SPEECH_MODEL_ID = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.:-]+$/;
export const SPEECH_VOICE_ID = /^[a-zA-Z0-9_.:-]{1,64}$/;
/** OpenRouter models bill per character; a reply is spoken in pieces of at most this. */
export const MAX_SPEECH_CHARS = 4_000;

/**
 * The models worth trying first, in order: the most natural multilingual
 * voices at the top. The catalog carries their live voices and prices; these
 * notes are what the list cannot say.
 */
export const RECOMMENDED_SPEECH_MODELS: Record<string, string> = {
  "google/gemini-3.8-flash-tts": "Most natural; many languages, 30 voices",
  "google/gemini-3.8-flash-lite-tts": "Same voices, faster and cheaper",
  "x-ai/grok-voice-tts-1.0": "20+ languages, picks the language itself",
  "microsoft/mai-voice-2": "Expressive, 15 languages",
  "microsoft/mai-voice-2-flash": "Expressive, lower latency",
  "mistralai/voxtral-mini-tts-2603": "Voices with a mood (neutral, cheerful, …)",
  "minimax/speech-2.8-hd": "Studio-quality English voices",
  "deepgram/aura-2": "90 voices in nine languages",
  "hexgrad/kokoro-82m": "Cheap and quick, eight languages",
  "deepgram/flux-tts:free": "Free English voices",
};

/** The voice used until the operator picks one. */
export const DEFAULT_SPEECH_CHOICE: SpeechChoice = {
  model: "google/gemini-3.8-flash-tts",
  voice: "Kore",
};

/** Models the catalog lists without a usable way to pick a voice. */
const HIDDEN = new Set(["bytedance-seed/seed-audio-1-0"]);

function perMillion(value: unknown) {
  const price = typeof value === "string" || typeof value === "number" ? Number(value) : NaN;
  return Number.isFinite(price) && price >= 0 ? price * 1e6 : null;
}

function money(value: number) {
  return `$${value >= 10 ? value.toFixed(0) : Number.isInteger(value) ? value : value.toFixed(2)}`;
}

/** Normalizes one entry of OpenRouter's speech model list; null when it cannot be offered. */
export function normalizeSpeechModel(entry: Record<string, unknown>): SpeechModel | null {
  const id = entry.id;
  if (typeof id !== "string" || !SPEECH_MODEL_ID.test(id) || HIDDEN.has(id)) return null;
  const voices = Array.isArray(entry.supported_voices)
    ? entry.supported_voices.filter(
        (voice): voice is string => typeof voice === "string" && SPEECH_VOICE_ID.test(voice),
      )
    : [];
  const pricing = (entry.pricing ?? {}) as Record<string, unknown>;
  const input = perMillion(pricing.prompt);
  const output = perMillion(pricing.completion);
  const price =
    input === 0 && !output
      ? "Free"
      : output
        ? `${money(input ?? 0)} per million characters in, ${money(output)} per million tokens out`
        : input === null
          ? "Price not listed"
          : `${money(input)} per million characters`;
  const rawName = typeof entry.name === "string" ? entry.name : id;
  return {
    id,
    name: rawName.replace(/\s*\((?:free|beta)\)\s*$/i, ""),
    voices,
    note: RECOMMENDED_SPEECH_MODELS[id] ?? firstSentence(entry.description),
    price,
    recommended: id in RECOMMENDED_SPEECH_MODELS,
  };
}

function firstSentence(description: unknown) {
  if (typeof description !== "string") return "";
  const sentence = description.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").match(/^.*?[.!?](?=\s|$)/);
  return (sentence?.[0] ?? description).slice(0, 140);
}

/** Recommended models first in their own order, then the rest by name. */
export function sortSpeechModels(models: SpeechModel[]) {
  const order = Object.keys(RECOMMENDED_SPEECH_MODELS);
  return models.toSorted((left, right) => {
    const a = order.indexOf(left.id);
    const b = order.indexOf(right.id);
    if (a !== -1 || b !== -1) return (a === -1 ? order.length : a) - (b === -1 ? order.length : b);
    return left.name.localeCompare(right.name);
  });
}

/** "Kore" stays; "aura-2-thalia-en" → "Thalia (en)"; "en-US-Harper:MAI-Voice-2" → "Harper (en-US)". */
export function speechVoiceLabel(voice: string) {
  const azure = voice.match(/^([a-z]{2}-[A-Z]{2})-([A-Za-z]+)(?::.*)?$/);
  if (azure) return `${azure[2]} (${azure[1]})`;
  const suffixed = voice.match(/^(?:aura-2-|flux-)([a-z]+)-([a-z]{2})$/);
  if (suffixed) return `${capitalize(suffixed[1]!)} (${suffixed[2]})`;
  const kokoro = voice.match(/^([abefhijpz])([fm])_([a-z]+)$/);
  if (kokoro) {
    const languages: Record<string, string> = {
      a: "en-US",
      b: "en-GB",
      e: "es",
      f: "fr",
      h: "hi",
      i: "it",
      j: "ja",
      p: "pt",
      z: "zh",
    };
    return `${capitalize(kokoro[3]!)} (${languages[kokoro[1]!]}, ${kokoro[2] === "f" ? "female" : "male"})`;
  }
  const mood = voice.match(/^([a-z]{2})_([a-z]+)_([a-z]+)$/);
  if (mood) return `${capitalize(mood[2]!)}, ${mood[3]} (${mood[1]})`;
  return voice
    .replace(/^English_/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function capitalize(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** What Preview says, in the language dictation uses. */
export function speechSample(language: string) {
  const code = language.toLowerCase().slice(0, 2);
  switch (code) {
    case "sv":
      return "Hej, jag är Ægentica. Så här låter jag när jag läser upp ett svar.";
    case "es":
      return "Hola, soy Ægentica. Así sueno cuando leo una respuesta en voz alta.";
    case "de":
      return "Hallo, ich bin Ægentica. So klinge ich, wenn ich eine Antwort vorlese.";
    case "fr":
      return "Bonjour, je suis Ægentica. Voici ma voix quand je lis une réponse.";
    default:
      return "Hi, I'm Ægentica. This is how I sound when I read a reply aloud.";
  }
}

/**
 * Splits spoken text into pieces a speech request can take, at sentence ends.
 * The first piece is short so the reply starts sooner; the rest are longer so
 * playback rarely waits between pieces.
 */
export function splitSpeech(text: string, first = 240, rest = 1_000) {
  const sentences = text.match(/[^.!?…]+(?:[.!?…]+["')\]]*|$)\s*/g)?.map((s) => s.trim()) ?? [];
  const pieces: string[] = [];
  let current = "";
  for (const sentence of sentences.filter(Boolean)) {
    const limit = pieces.length === 0 ? first : rest;
    for (const part of splitLong(sentence, rest)) {
      if (current && current.length + part.length + 1 > limit) {
        pieces.push(current);
        current = part;
      } else current = current ? `${current} ${part}` : part;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/** A sentence longer than a request may take is cut at spaces. */
function splitLong(sentence: string, limit: number) {
  if (sentence.length <= limit) return [sentence];
  const parts: string[] = [];
  let remaining = sentence;
  while (remaining.length > limit) {
    const cut = remaining.lastIndexOf(" ", limit);
    const at = cut > limit / 2 ? cut : limit;
    parts.push(remaining.slice(0, at).trim());
    remaining = remaining.slice(at).trim();
  }
  if (remaining) parts.push(remaining);
  return parts;
}
