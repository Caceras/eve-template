import {
  normalizeSpeechModel,
  sortSpeechModels,
  RECOMMENDED_SPEECH_MODELS,
  type SpeechModel,
} from "./speech-models";

const CATALOG_URL = "https://openrouter.ai/api/v1/models?output_modalities=speech";
const MAX_BYTES = 2_000_000;
const CACHE_MS = 6 * 60 * 60_000;
const RETRY_MS = 60_000;

/** Enough to choose a voice while OpenRouter's list cannot be read. */
const FALLBACK: SpeechModel[] = sortSpeechModels(
  [
    {
      id: "google/gemini-3.8-flash-tts",
      name: "Google: Gemini 3.8 Flash TTS",
      voices: ["Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede"],
      price: "$0.50 per million characters in, $9 per million tokens out",
    },
    {
      id: "google/gemini-3.8-flash-lite-tts",
      name: "Google: Gemini 3.8 Flash Lite TTS",
      voices: ["Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus", "Aoede"],
      price: "$0.50 per million characters in, $6 per million tokens out",
    },
    {
      id: "x-ai/grok-voice-tts-1.0",
      name: "SpaceXAI: Grok Voice TTS 1.0",
      voices: ["eve", "ara", "rex", "sal", "leo"],
      price: "$15 per million characters",
    },
    {
      id: "hexgrad/kokoro-82m",
      name: "hexgrad: Kokoro 82M",
      voices: ["af_heart", "af_bella", "am_michael", "bf_emma", "bm_george"],
      price: "$4 per million characters",
    },
  ].map((model) => ({
    ...model,
    note: RECOMMENDED_SPEECH_MODELS[model.id] ?? "",
    recommended: true,
  })),
);

let cached: { models: SpeechModel[]; live: boolean; expiresAt: number } | undefined;
let pending: Promise<SpeechModel[]> | undefined;

async function fetchModels(): Promise<SpeechModel[]> {
  try {
    const response = await fetch(CATALOG_URL, {
      signal: AbortSignal.timeout(8_000),
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok || !response.body) throw new Error("Catalog unavailable");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        throw new Error("Catalog too large");
      }
      chunks.push(value);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!Array.isArray(body?.data)) throw new Error("Invalid catalog");
    const models = sortSpeechModels(
      body.data
        .filter((entry: unknown) => entry && typeof entry === "object")
        .map((entry: Record<string, unknown>) => normalizeSpeechModel(entry))
        .filter((model: SpeechModel | null): model is SpeechModel => model !== null),
    );
    if (models.length === 0) throw new Error("Empty catalog");
    cached = { models, live: true, expiresAt: Date.now() + CACHE_MS };
  } catch {
    cached = {
      models: cached?.models ?? FALLBACK,
      live: false,
      expiresAt: Date.now() + RETRY_MS,
    };
  }
  return cached.models;
}

/** OpenRouter's speech models, cached for six hours, with a bundled fallback. */
export async function getSpeechModels(): Promise<SpeechModel[]> {
  if (cached && Date.now() < cached.expiresAt) return cached.models;
  pending ??= fetchModels().finally(() => {
    pending = undefined;
  });
  // A known list is served while it refreshes, so a reply never waits on the catalog.
  return cached ? cached.models : pending;
}
