"use client";
import { PlayIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveVoicePreferences, useVoicePreferences } from "@/lib/voice/preferences";
import { canDictate, canSpeak, speak } from "@/lib/voice/speech";
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

function Row({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:px-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-xs leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function VoiceSettings() {
  const preferences = useVoicePreferences();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [support, setSupport] = useState({ dictation: true, speech: true });

  useEffect(() => {
    setSupport({ dictation: canDictate(), speech: canSpeak() });
    if (!canSpeak()) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, []);

  const language = preferences.language === "auto" ? "" : preferences.language.slice(0, 2);
  const matching = voices
    .filter((voice) => !language || voice.lang.toLowerCase().startsWith(language))
    .toSorted((left, right) => left.name.localeCompare(right.name));

  return (
    <SettingsShell
      section="voice"
      title="Voice"
      description="Talk instead of typing, and have replies read aloud. These choices apply to this device."
    >
      <section aria-labelledby="voice-general" className="rounded-lg border bg-card">
        <h2 id="voice-general" className="px-3 pt-3 text-sm font-medium sm:px-4">
          General
        </h2>
        <div className="divide-y">
          <Row title="Language" description="Used for dictation and for choosing a voice.">
            <Select
              value={preferences.language}
              onValueChange={(value) => saveVoicePreferences({ language: value, voice: "" })}
            >
              <SelectTrigger aria-label="Language" className="h-11 w-full sm:w-52 md:h-9">
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
                ? "Tap the microphone in the message box, speak, then tap it again or send."
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
        {support.speech ? (
          <div className="divide-y">
            <Row
              title="Voice"
              description="Voices come from this device; more can be added in its system settings."
            >
              <div className="flex items-center gap-1">
                <Select
                  value={preferences.voice || SYSTEM_VOICE}
                  onValueChange={(value) =>
                    saveVoicePreferences({ voice: value === SYSTEM_VOICE ? "" : value })
                  }
                >
                  <SelectTrigger aria-label="Voice" className="h-11 w-full sm:w-52 md:h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SYSTEM_VOICE}>System default</SelectItem>
                    {matching.map((voice) => (
                      <SelectItem key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  aria-label="Preview voice"
                  className="size-11 md:size-9"
                  onClick={() => speak("Hi, I'm Ægentica. This is how I sound.")}
                  size="icon"
                  type="button"
                  variant="ghost"
                >
                  <PlayIcon className="size-4" />
                </Button>
              </div>
            </Row>
            <Row title="Speed">
              <Select
                value={String(preferences.rate)}
                onValueChange={(value) => saveVoicePreferences({ rate: Number(value) })}
              >
                <SelectTrigger aria-label="Speed" className="h-11 w-full sm:w-52 md:h-9">
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
              description="Speak each new reply when it finishes. Any reply also has a Read aloud button."
            >
              <Button
                aria-pressed={preferences.readReplies}
                className="h-11 min-w-20 md:h-9"
                onClick={() => saveVoicePreferences({ readReplies: !preferences.readReplies })}
                type="button"
                variant={preferences.readReplies ? "default" : "outline"}
              >
                {preferences.readReplies ? "On" : "Off"}
              </Button>
            </Row>
          </div>
        ) : (
          <p className="p-3 text-sm text-muted-foreground sm:px-4">
            This browser cannot speak replies aloud.
          </p>
        )}
      </section>
      <p className="text-xs leading-5 text-muted-foreground">
        Dictation and spoken replies use your device’s built-in speech features, so they cost
        nothing. In Chrome, dictation is processed by Google’s speech service.
      </p>
    </SettingsShell>
  );
}
