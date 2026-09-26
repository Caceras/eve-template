import { getPasswordSessionFromHeaders, hasSameOriginRequest } from "./password-auth";
import { readProviderKey } from "./provider-settings";
import { json } from "./settings-api";
import { speechStatus, validSpeechChoice } from "./voice-settings";
import { MAX_SPEECH_CHARS, type SpeechChoice } from "./voice/speech-models";

const SPEECH_URL = "https://openrouter.ai/api/v1/audio/speech";
const MAX_BODY_BYTES = 32_768;
const MAX_REQUESTS_PER_MINUTE = 90;
let windowStart = 0;
let requests = 0;

/**
 * Reads replies aloud with an OpenRouter voice. GET says which voice applies;
 * POST turns one piece of text into MP3 audio through the saved key, so the
 * key never reaches the browser.
 */
export async function handleSpeech(request: Request, resolveViewer: () => Promise<unknown>) {
  const viewer = await resolveViewer();
  if (!viewer) return json({ error: "Sign in to use spoken replies." }, 401);
  if (request.method === "GET") {
    const { configured, speech } = await speechStatus();
    return json({ configured, speech });
  }
  if (!hasSameOriginRequest(request)) return json({ error: "Invalid request origin." }, 403);
  if (Date.now() - windowStart > 60_000) {
    windowStart = Date.now();
    requests = 0;
  }
  if (++requests > MAX_REQUESTS_PER_MINUTE)
    return json({ error: "Too many spoken replies at once. Try again in a minute." }, 429);

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ error: "Request too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > MAX_SPEECH_CHARS)
    return json({ error: `Speak up to ${MAX_SPEECH_CHARS} characters at a time.` }, 400);

  const status = await speechStatus();
  if (!status.configured)
    return json({ error: "Save an OpenRouter key in Settings → Models to use its voices." }, 400);
  // Settings previews a voice before saving it; only the operator may pick one per request.
  let choice: SpeechChoice | null = status.speech;
  if (body.speech !== undefined) {
    if (!getPasswordSessionFromHeaders(request.headers))
      return json({ error: "Sign in as the operator to preview voices." }, 403);
    choice = validSpeechChoice(status.models, body.speech);
    if (!choice) return json({ error: "Choose a voice from the list." }, 400);
  }
  if (!choice)
    return json({ error: "No OpenRouter voice is chosen. Pick one in Settings → Voice." }, 400);

  const { apiKey } = await readProviderKey("openrouter");
  let upstream: Response;
  try {
    upstream = await fetch(SPEECH_URL, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.BETTER_AUTH_URL ?? "",
        "X-Title": "Ægentica",
      },
      body: JSON.stringify({
        model: choice.model,
        input: text,
        ...(choice.voice ? { voice: choice.voice } : {}),
        response_format: "mp3",
      }),
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return json(
      {
        error: timedOut
          ? "OpenRouter took too long to produce the audio. Try a faster voice."
          : "Could not reach OpenRouter from the server. Try again in a moment.",
      },
      502,
    );
  }
  const type = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok || !upstream.body || !type.startsWith("audio/")) {
    const detail = (await upstream.json().catch(() => null)) as {
      error?: { code?: unknown; message?: unknown };
    } | null;
    const code = Number(detail?.error?.code) || upstream.status;
    return json({ error: describeSpeechError(code, choice) }, code >= 500 ? 502 : 422);
  }
  return new Response(upstream.body, {
    status: 200,
    headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" },
  });
}

function describeSpeechError(code: number, choice: SpeechChoice) {
  switch (code) {
    case 401:
      return "OpenRouter rejected the saved key. Check it in Settings → Models.";
    case 402:
      return "OpenRouter is out of credits. Top up at openrouter.ai and try again.";
    case 403:
      return `OpenRouter refused ${choice.model}: the key may lack access to it. Pick another voice.`;
    case 404:
      return `${choice.model} is not available on OpenRouter right now. Pick another voice.`;
    case 429:
      return "OpenRouter is rate limiting this key. Try again in a moment.";
    default:
      return `${choice.model} could not produce the audio. Try another voice.`;
  }
}
