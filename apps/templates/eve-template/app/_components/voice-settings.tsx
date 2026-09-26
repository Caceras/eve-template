"use client";
import { Loader2Icon, PlayIcon, SquareIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { forgetSpeechChoice, rememberSpeechChoice } from "@/lib/voice/openrouter-speech";
import {
  resolveLanguage,
  saveVoicePreferences,
  useVoicePreferences,
} from "@/lib/voice/preferences";
import { canDictate, canSpeak, speak, stopSpeaking } from "@/lib/voice/speech";
import {
  speechSample,
  speechVoiceLabel,
  type SpeechChoice,
  type SpeechModel,
} from "@/lib/voice/speech-models";
import type { SpeechStatus } from "@/lib/voice-settings";
import { SettingsShell } from "./settings-shell";

const LANGUAGES = [
  { value: "auto", label: "Same as this device" },
  { value: "sv-SE", label: "Svenska" },
  { value: "en-US", label: "English (US)" },
  { value: "en-GB", label: "English (UK)" },
  { value: "es-ES", label: "Español" },
];
const RATES = [
  { value: "0.85", label: "Slower" },
  { value: "1", label: "Normal" },
  { value: "1.15", label: "Faster" },
  { value: "1.3", label: "Fastest" },
];
const SYSTEM_VOICE = "system";
const DEVICE = "device";
const DEFAULT_VOICE = "default";
const control = "w-full sm:w-64 data-[size=default]:h-11 pointer-fine:md:data-[size=default]:h-9";

function Row({
  title,
  titleId,
  description,
  children,
}: {
  readonly title: string;
  /** Lets the row's control take the title as its accessible name. */
  readonly titleId?: string;
  readonly description?: React.ReactNode;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium" id={titleId}>
          {title}
        </p>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

async function voiceSettings(body?: Record<string, unknown>): Promise<SpeechStatus> {
  const response = await fetch("/api/settings/voice", {
    method: body ? "POST" : "GET",
    cache: "no-store",
    ...(body
      ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
      : {}),
  });
  const data = (await response.json().catch(() => null)) as
    | (SpeechStatus & { error?: string })
    | null;
  if (!response.ok || !data || data.error)
    throw new Error(data?.error ?? "Could not load voice settings. Retry in a moment.");
  return data;
}

export function VoiceSettings() {
  const preferences = useVoicePreferences();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [support, setSupport] = useState({ dictation: true, speech: true });
  const [status, setStatus] = useState<SpeechStatus | null>(null);
  const [statusError, setStatusError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    setSupport({ dictation: canDictate(), speech: canSpeak() });
    if (!("speechSynthesis" in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);
  useEffect(() => {
    let cancelled = false;
    voiceSettings()
      .then((value) => {
        if (cancelled) return;
        setStatus(value);
        rememberSpeechChoice({ configured: value.configured, speech: value.speech });
      })
      .catch((error: Error) => !cancelled && setStatusError(error.message));
    return () => {
      cancelled = true;
      stopSpeaking();
    };
  }, []);

  const language = preferences.language === "auto" ? "" : preferences.language.slice(0, 2);
  const matching = voices
    .filter((voice) => !language || voice.lang.toLowerCase().startsWith(language))
    .toSorted((left, right) => left.name.localeCompare(right.name));
  const models = useMemo(() => status?.models ?? [], [status]);
  const chosenModel: SpeechModel | undefined = status?.speech
    ? models.find((model) => model.id === status.speech!.model)
    : undefined;
  const source = status?.speech ? status.speech.model : DEVICE;

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setSaveError("");
    setPreviewError("");
    stopSpeaking();
    try {
      const next = await voiceSettings(body);
      setStatus(next);
      rememberSpeechChoice({ configured: next.configured, speech: next.speech });
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save the voice.");
      forgetSpeechChoice();
    } finally {
      setSaving(false);
    }
  }
  function chooseModel(id: string) {
    if (id === DEVICE) return void save({ action: "device" });
    const model = models.find((item) => item.id === id);
    if (!model) return;
    void save({ action: "choose", speech: { model: model.id, voice: model.voices[0] ?? "" } });
  }
  function chooseVoice(voice: string) {
    if (!chosenModel) return;
    void save({
      action: "choose",
      speech: { model: chosenModel.id, voice: voice === DEFAULT_VOICE ? "" : voice },
    });
  }
  function preview(choice?: SpeechChoice) {
    if (previewing) {
      stopSpeaking();
      setPreviewing(false);
      return;
    }
    setPreviewError("");
    setPreviewing(true);
    speak(
      speechSample(resolveLanguage(preferences.language)),
      {
        onEnd: () => setPreviewing(false),
        onError: (message) => setPreviewError(message),
      },
      choice,
    );
  }
  const previewButton = (choice?: SpeechChoice) => (
    <Button
      aria-label={previewing ? "Stop preview" : "Preview voice"}
      className="size-11 pointer-fine:md:size-9"
      disabled={saving}
      onClick={() => preview(choice)}
      size="icon"
      type="button"
      variant="ghost"
    >
      {previewing ? (
        <SquareIcon className="size-3 fill-current" />
      ) : (
        <PlayIcon className="size-4" />
      )}
    </Button>
  );

  return (
    <SettingsShell
      section="voice"
      title="Voice"
      description="Talk instead of typing, and have replies read aloud. Language, speed and Read replies aloud apply to this device; the voice itself is shared by every device."
    >
      <section aria-labelledby="voice-general" className="rounded-lg border bg-card">
        <h2 id="voice-general" className="px-3 pt-3 text-sm font-medium sm:px-4">
          General
        </h2>
        <div className="divide-y">
          <Row
            title="Language"
            description="Used for dictation, the preview and this device's voices."
          >
            <Select
              value={preferences.language}
              onValueChange={(value) => saveVoicePreferences({ language: value, voice: "" })}
            >
              <SelectTrigger aria-label="Language" className={control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row
            title="Dictation"
            description={
              support.dictation
                ? "Tap the microphone in the message box, speak, then tap it again or send. In a voice conversation, Ægentica listens, answers aloud and listens again."
                : "This browser has no built-in speech recognition. Chrome and Safari do."
            }
          >
            <span className="text-xs text-muted-foreground">
              {support.dictation ? "Available" : "Not available"}
            </span>
          </Row>
        </div>
      </section>

      <section aria-labelledby="voice-replies" className="rounded-lg border bg-card">
        <h2 id="voice-replies" className="px-3 pt-3 text-sm font-medium sm:px-4">
          Spoken replies
        </h2>
        <div className="divide-y">
          <Row
            title="Voice"
            description={
              status?.configured
                ? "OpenRouter voices use the saved key and cost per character read; this device's voices are free."
                : statusError ||
                  (status ? (
                    <>
                      Add an{" "}
                      <Link className="underline" href="/settings">
                        OpenRouter key
                      </Link>{" "}
                      to choose from its natural voices. This device's voices are free.
                    </>
                  ) : (
                    "Loading voices…"
                  ))
            }
          >
            <div className="flex items-center gap-1">
              <Select
                disabled={!status || saving}
                onValueChange={chooseModel}
                value={status ? source : DEVICE}
              >
                <SelectTrigger aria-label="Voice source" className={control}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[60vh]">
                  <SelectItem value={DEVICE}>This device&apos;s voices</SelectItem>
                  {status?.configured ? (
                    <>
                      <SelectGroup>
                        <SelectLabel>OpenRouter, recommended</SelectLabel>
                        {models
                          .filter((model) => model.recommended)
                          .map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.name}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>OpenRouter, more</SelectLabel>
                        {models
                          .filter((model) => !model.recommended)
                          .map((model) => (
                            <SelectItem key={model.id} value={model.id}>
                              {model.name}
                            </SelectItem>
                          ))}
                      </SelectGroup>
                    </>
                  ) : null}
                </SelectContent>
              </Select>
              {saving ? (
                <span className="flex size-11 items-center justify-center pointer-fine:md:size-9">
                  <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                </span>
              ) : source === DEVICE ? (
                previewButton()
              ) : null}
            </div>
          </Row>
          {chosenModel ? (
            <Row
              title={chosenModel.name}
              description={[chosenModel.note, chosenModel.price].filter(Boolean).join(" · ")}
            >
              <div className="flex items-center gap-1">
                <Select
                  disabled={saving}
                  onValueChange={chooseVoice}
                  value={status?.speech?.voice || DEFAULT_VOICE}
                >
                  <SelectTrigger aria-label="Voice" className={control}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-[60vh]">
                    {chosenModel.voices.length === 0 ? (
                      <SelectItem value={DEFAULT_VOICE}>Default voice</SelectItem>
                    ) : (
                      chosenModel.voices.map((voice) => (
                        <SelectItem key={voice} value={voice}>
                          {speechVoiceLabel(voice)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {previewButton(status?.speech ?? undefined)}
              </div>
            </Row>
          ) : null}
          {source === DEVICE && support.speech ? (
            <Row
              title="Device voice"
              description="Voices come from this device; more can be added in its system settings."
            >
              <Select
                value={preferences.voice || SYSTEM_VOICE}
                onValueChange={(value) =>
                  saveVoicePreferences({ voice: value === SYSTEM_VOICE ? "" : value })
                }
              >
                <SelectTrigger aria-label="Device voice" className={control}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-[60vh]">
                  <SelectItem value={SYSTEM_VOICE}>System default</SelectItem>
                  {matching.map((voice) => (
                    <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Row>
          ) : null}
          {saveError || previewError ? (
            <p className="px-3 py-2 text-xs text-destructive sm:px-4" role="alert">
              {saveError || previewError}
            </p>
          ) : null}
          <Row title="Speed">
            <Select
              value={String(preferences.rate)}
              onValueChange={(value) => saveVoicePreferences({ rate: Number(value) })}
            >
              <SelectTrigger aria-label="Speed" className={control}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RATES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Row>
          <Row
            title="Read replies aloud"
            titleId="read-replies-title"
            description="Speak each new reply when it finishes. Any reply also has a Read aloud button."
          >
            {/* A switch named by its row; On and Off are its state, not its name. */}
            <Button
              aria-checked={preferences.readReplies}
              aria-labelledby="read-replies-title"
              role="switch"
              className="h-11 min-w-20 pointer-fine:md:h-9"
              onClick={() => saveVoicePreferences({ readReplies: !preferences.readReplies })}
              type="button"
              variant={preferences.readReplies ? "default" : "outline"}
            >
              {preferences.readReplies ? "On" : "Off"}
            </Button>
          </Row>
        </div>
      </section>
      <p className="text-xs leading-5 text-muted-foreground">
        Dictation uses your device&apos;s built-in speech recognition (in Chrome, Google&apos;s
        speech service). Spoken replies use the chosen OpenRouter voice, and fall back to this
        device&apos;s free voice if that voice cannot be reached.
      </p>
    </SettingsShell>
  );
}
