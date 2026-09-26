import { readProviderKey } from "./provider-settings";
import { readJson, writeJson, withSettingsLock } from "./secure-settings";
import { getSpeechModels } from "./voice/speech-catalog";
import {
  DEFAULT_SPEECH_CHOICE,
  SPEECH_MODEL_ID,
  SPEECH_VOICE_ID,
  type SpeechChoice,
  type SpeechModel,
} from "./voice/speech-models";

const FILE = "voice.json";

/**
 * Which OpenRouter voice reads replies, saved with the other operator settings
 * so every device speaks with the same voice. `null` means the device's own
 * voices; unset means the default OpenRouter voice while a key exists.
 */
export type SavedSpeechChoice = { speech: SpeechChoice | null };

export async function readSpeechChoice(): Promise<SpeechChoice | null | undefined> {
  try {
    const value = (await readJson(FILE)) as Record<string, unknown> | undefined;
    if (!value || !("speech" in value)) return undefined;
    const speech = value.speech as Record<string, unknown> | null;
    if (speech === null) return null;
    return typeof speech?.model === "string" &&
      SPEECH_MODEL_ID.test(speech.model) &&
      typeof speech.voice === "string" &&
      (speech.voice === "" || SPEECH_VOICE_ID.test(speech.voice))
      ? { model: speech.model, voice: speech.voice }
      : undefined;
  } catch {
    return undefined;
  }
}

export async function saveSpeechChoice(speech: SpeechChoice | null) {
  await withSettingsLock(FILE, () => writeJson(FILE, { speech } satisfies SavedSpeechChoice));
}

export async function hasOpenRouterKey() {
  try {
    return Boolean((await readProviderKey("openrouter")).apiKey);
  } catch {
    return false;
  }
}

export type SpeechStatus = {
  /** An OpenRouter key is saved, so its voices can be used. */
  configured: boolean;
  /** The voice replies use; null for the device's own voices. */
  speech: SpeechChoice | null;
  /** Whether the operator chose, or the default applies. */
  chosen: boolean;
  models: SpeechModel[];
};

/** The effective voice: the operator's choice, else the default while a key exists. */
export async function speechStatus(): Promise<SpeechStatus> {
  const [configured, saved, models] = await Promise.all([
    hasOpenRouterKey(),
    readSpeechChoice(),
    getSpeechModels(),
  ]);
  const speech = !configured
    ? null
    : saved === undefined
      ? resolveDefault(models)
      : saved && models.some((model) => model.id === saved.model)
        ? saved
        : saved && null;
  return { configured, speech, chosen: saved !== undefined, models };
}

function resolveDefault(models: SpeechModel[]): SpeechChoice | null {
  const preferred = models.find((model) => model.id === DEFAULT_SPEECH_CHOICE.model);
  if (preferred)
    return {
      model: preferred.id,
      voice: preferred.voices.includes(DEFAULT_SPEECH_CHOICE.voice)
        ? DEFAULT_SPEECH_CHOICE.voice
        : (preferred.voices[0] ?? ""),
    };
  const first = models[0];
  return first ? { model: first.id, voice: first.voices[0] ?? "" } : null;
}

/** A choice the catalog knows: the model exists and the voice is one of its voices. */
export function validSpeechChoice(models: SpeechModel[], value: unknown): SpeechChoice | null {
  const record = value as Record<string, unknown> | null;
  if (!record || typeof record.model !== "string" || !SPEECH_MODEL_ID.test(record.model))
    return null;
  const model = models.find((item) => item.id === record.model);
  if (!model) return null;
  const voice = typeof record.voice === "string" ? record.voice : "";
  if (model.voices.length ? !model.voices.includes(voice) : voice !== "") return null;
  return { model: model.id, voice };
}
