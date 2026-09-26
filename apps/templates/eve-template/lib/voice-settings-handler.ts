import { handleOperatorSettings, json } from "./settings-api";
import { saveSpeechChoice, speechStatus, validSpeechChoice } from "./voice-settings";

export function handleVoiceSettings(request: Request) {
  return handleOperatorSettings(request, {
    read: async () => json(await speechStatus()),
    async write(body) {
      switch (body.action) {
        case "choose": {
          const status = await speechStatus();
          if (!status.configured)
            return json({ error: "Save an OpenRouter key in Settings → Models first." }, 400);
          const choice = validSpeechChoice(status.models, body.speech);
          if (!choice) return json({ error: "Choose a voice from the list." }, 400);
          await saveSpeechChoice(choice);
          return json(await speechStatus());
        }
        case "device":
          await saveSpeechChoice(null);
          return json(await speechStatus());
        default:
          return json({ error: "Invalid action." }, 400);
      }
    },
  });
}
