// Spoken replies with an OpenRouter voice: the catalog, the saved choice, and
// the speech route that spends the key without exposing it.
import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^\.\.?\//.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const assert = (await import("node:assert/strict")).default;
const { mkdtemp, rm } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { randomBytes } = await import("node:crypto");
const { normalizeSpeechModel, splitSpeech, speechVoiceLabel, sortSpeechModels } =
  await import("../lib/voice/speech-models.ts");

// Text is spoken in sentence-sized pieces: a short first one, longer ones after.
assert.deepEqual(splitSpeech("Hello there. How are you?"), ["Hello there. How are you?"]);
const long = Array.from({ length: 30 }, (_, i) => `Sentence number ${i + 1} is here.`).join(" ");
const pieces = splitSpeech(long);
assert(pieces.length >= 2, "a long reply becomes several pieces");
assert(pieces[0].length <= 240, "the first piece is short so speech starts sooner");
assert(pieces.slice(1).every((piece) => piece.length <= 1000));
assert.equal(pieces.join(" "), long, "nothing is lost or duplicated");
assert(
  pieces.every((piece) => /[.!?]$/.test(piece)),
  "pieces end at sentence ends",
);
const unbroken = "word ".repeat(400).trim();
assert(
  splitSpeech(unbroken).every((piece) => piece.length <= 1000),
  "no sentence end: cut at spaces",
);
assert.equal(splitSpeech(unbroken).join(" "), unbroken);
assert.deepEqual(splitSpeech("   "), []);

// The catalog keeps the models one can pick a voice for, with readable prices.
const gemini = normalizeSpeechModel({
  id: "google/gemini-3.8-flash-tts",
  name: "Google: Gemini 3.8 Flash TTS",
  pricing: { prompt: "0.0000005", completion: "0.000009" },
  supported_voices: ["Kore", "Puck"],
  description: "Gemini 3.8 Flash TTS is a text-to-speech model. It is the creative tier.",
});
assert.equal(gemini.recommended, true);
assert.equal(gemini.price, "$0.50 per million characters in, $9 per million tokens out");
assert.deepEqual(gemini.voices, ["Kore", "Puck"]);
const flux = normalizeSpeechModel({
  id: "deepgram/flux-tts:free",
  name: "Deepgram: Flux TTS (free)",
  pricing: { prompt: "0", completion: "0" },
  supported_voices: ["flux-alexis-en"],
});
assert.equal(flux.price, "Free");
assert.equal(flux.name, "Deepgram: Flux TTS");
const other = normalizeSpeechModel({
  id: "fish-audio/s1",
  name: "Fish Audio: S1",
  pricing: { prompt: "0.000015" },
  supported_voices: null,
  description: "S1 is a multilingual [model](https://x.test). It has style controls.",
});
assert.equal(other.price, "$15 per million characters");
assert.equal(other.note, "S1 is a multilingual model.");
assert.deepEqual(other.voices, []);
assert.equal(normalizeSpeechModel({ id: "bytedance-seed/seed-audio-1-0" }), null);
assert.equal(normalizeSpeechModel({ id: "not a model id" }), null);
assert.deepEqual(
  sortSpeechModels([other, flux, gemini]).map((model) => model.id),
  ["google/gemini-3.8-flash-tts", "deepgram/flux-tts:free", "fish-audio/s1"],
  "recommended models first, in their order, then the rest by name",
);
assert.equal(speechVoiceLabel("Kore"), "Kore");
assert.equal(speechVoiceLabel("en-US-Harper:MAI-Voice-2"), "Harper (en-US)");
assert.equal(speechVoiceLabel("aura-2-thalia-en"), "Thalia (en)");
assert.equal(speechVoiceLabel("flux-alexis-en"), "Alexis (en)");
assert.equal(speechVoiceLabel("bf_emma"), "Emma (en-GB, female)");
assert.equal(speechVoiceLabel("gb_oliver_cheerful"), "Oliver, cheerful (gb)");
assert.equal(speechVoiceLabel("English_expressive_narrator"), "expressive narrator");

// The routes: who may choose a voice, who may spend the key, and what reaches OpenRouter.
const directory = await mkdtemp(join(tmpdir(), "aegentica-voice-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_MEMORY_DIR = join(directory, "memory");
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.EVE_CHAT_PASSWORD = "test-password-" + randomBytes(8).toString("hex");
process.env.BETTER_AUTH_URL = "https://app.test";
delete process.env.OPENROUTER_API_KEY;
delete process.env.AI_GATEWAY_API_KEY;
const originalFetch = globalThis.fetch;
const upstream = [];
let upstreamStatus = 200;
globalThis.fetch = async (url, init) => {
  const target = String(url);
  if (target.startsWith("https://openrouter.ai/api/v1/models"))
    return Response.json({
      data: [
        {
          id: "google/gemini-3.8-flash-tts",
          name: "Google: Gemini 3.8 Flash TTS",
          pricing: { prompt: "0.0000005", completion: "0.000009" },
          supported_voices: ["Kore", "Puck"],
        },
        {
          id: "x-ai/grok-voice-tts-1.0",
          name: "SpaceXAI: Grok Voice TTS 1.0",
          pricing: { prompt: "0.000015" },
          supported_voices: ["eve", "ara"],
        },
      ],
    });
  if (target === "https://openrouter.ai/api/v1/audio/speech") {
    upstream.push({ headers: init.headers, body: JSON.parse(init.body) });
    if (upstreamStatus !== 200)
      return Response.json({ error: { code: upstreamStatus, message: "nope" } }, { status: 200 });
    return new Response(new Uint8Array([73, 68, 51]), {
      headers: { "content-type": "audio/mpeg" },
    });
  }
  throw new Error("Unexpected fetch " + target);
};
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");
const { saveProviderKey } = await import("../lib/provider-settings.ts");
const { handleVoiceSettings } = await import("../lib/voice-settings-handler.ts");
const { handleSpeech } = await import("../lib/voice-speech-handler.ts");
const cookie = `eve_chat_session=${createPasswordSessionToken()}`;
function request(path, body, options = {}) {
  return new Request("https://app.test" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "app.test",
      origin: options.origin || "https://app.test",
      ...(options.anonymous ? {} : { cookie }),
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
const settings = (body, options) =>
  handleVoiceSettings(request("/api/settings/voice", body, options));
// The speech route reads the viewer through next/headers; here the cookie decides.
const { getPasswordSessionFromHeaders } = await import("../lib/password-auth.ts");
const speech = (body, options) => {
  const req = request("/api/voice/speech", body, options);
  return handleSpeech(req, async () =>
    getPasswordSessionFromHeaders(req.headers) ? { id: "eve-chat-user" } : null,
  );
};
try {
  assert.equal((await settings(undefined, { anonymous: true })).status, 401);
  let status = await (await settings()).json();
  assert.equal(status.configured, false, "no OpenRouter key: device voices");
  assert.equal(status.speech, null);
  assert.equal(status.models.length, 2, "the catalog is listed even before a key is saved");
  assert.equal(
    (
      await settings({
        action: "choose",
        speech: { model: "x-ai/grok-voice-tts-1.0", voice: "eve" },
      })
    ).status,
    400,
    "a voice cannot be chosen without a key",
  );

  await saveProviderKey("openrouter", "sk-or-v1-" + randomBytes(32).toString("hex"));
  status = await (await settings()).json();
  assert.equal(status.configured, true);
  assert.deepEqual(
    status.speech,
    { model: "google/gemini-3.8-flash-tts", voice: "Kore" },
    "with a key and no choice, the recommended voice applies",
  );
  assert.equal(status.chosen, false);
  assert.equal(
    (
      await settings({
        action: "choose",
        speech: { model: "google/gemini-3.8-flash-tts", voice: "Nope" },
      })
    ).status,
    400,
    "a voice the model lacks is refused",
  );
  assert.equal(
    (await settings({ action: "choose", speech: { model: "evil/model", voice: "x" } })).status,
    400,
  );
  status = await (
    await settings({ action: "choose", speech: { model: "x-ai/grok-voice-tts-1.0", voice: "eve" } })
  ).json();
  assert.deepEqual(status.speech, { model: "x-ai/grok-voice-tts-1.0", voice: "eve" });
  assert.equal(status.chosen, true);
  status = await (await settings({ action: "device" })).json();
  assert.equal(status.speech, null, "back to the device's voices");
  assert.equal(status.chosen, true);
  await settings({ action: "choose", speech: { model: "x-ai/grok-voice-tts-1.0", voice: "ara" } });
  assert.equal(
    (
      await settings(
        { action: "choose", speech: { model: "x-ai/grok-voice-tts-1.0", voice: "ara" } },
        { origin: "https://evil.test" },
      )
    ).status,
    403,
  );

  // Speaking: signed-in and same-origin only, bounded text, the key stays on the server.
  assert.equal((await speech(undefined, { anonymous: true })).status, 401);
  assert.deepEqual(await (await speech()).json(), {
    configured: true,
    speech: { model: "x-ai/grok-voice-tts-1.0", voice: "ara" },
  });
  assert.equal((await speech({ text: "Hi" }, { origin: "https://evil.test" })).status, 403);
  assert.equal((await speech({ text: "" })).status, 400);
  assert.equal((await speech({ text: "x".repeat(4001) })).status, 400);
  assert.equal((await speech("{not json")).status, 400);
  const audio = await speech({ text: "Hej på dig." });
  assert.equal(audio.status, 200);
  assert.equal(audio.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual([...new Uint8Array(await audio.arrayBuffer())], [73, 68, 51]);
  assert.deepEqual(upstream.at(-1).body, {
    model: "x-ai/grok-voice-tts-1.0",
    input: "Hej på dig.",
    voice: "ara",
    response_format: "mp3",
  });
  assert.match(upstream.at(-1).headers.Authorization, /^Bearer sk-or-v1-/);
  // Settings previews a voice that is not saved yet.
  await speech({
    text: "Preview",
    speech: { model: "google/gemini-3.8-flash-tts", voice: "Puck" },
  });
  assert.equal(upstream.at(-1).body.model, "google/gemini-3.8-flash-tts");
  assert.equal(upstream.at(-1).body.voice, "Puck");
  assert.equal(
    (
      await speech({
        text: "Preview",
        speech: { model: "google/gemini-3.8-flash-tts", voice: "Nope" },
      })
    ).status,
    400,
  );
  upstreamStatus = 402;
  const broke = await speech({ text: "Hi" });
  assert.equal(broke.status, 422);
  assert.match((await broke.json()).error, /out of credits/);
} finally {
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
}
console.log(
  "PASS: spoken replies: sentence pieces, the OpenRouter voice catalog, and the operator's voice choice",
);
