import { PROVIDERS, isProviderId, pickModel, type ProviderId } from "./model-catalog";
import { getCatalog } from "./provider-catalog";
import {
  providerStatus,
  readProviderKey,
  removeProviderKey,
  saveProviderKey,
  setActiveProvider,
} from "./provider-settings";
import { getPasswordSessionFromHeaders, hasSameOriginRequest } from "./password-auth";

const API_BASE: Record<ProviderId, string> = {
  gateway: "https://ai-gateway.vercel.sh/v1",
  openrouter: "https://openrouter.ai/api/v1",
};
let windowStart = 0;
let attempts = 0;
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader)
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) {
        await reader.cancel();
        return "too-large" as const;
      }
      chunks.push(value);
    }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function keyError(provider: ProviderId, key: string) {
  if (key.length < 20 || key.length > 2048 || /[^\x21-\x7e]/.test(key))
    return `Enter a valid ${PROVIDERS[provider].label} API key.`;
  const looksOpenRouter = key.startsWith("sk-or-");
  if (provider === "gateway" && looksOpenRouter)
    return "This is an OpenRouter key. Save it under OpenRouter instead.";
  if (provider === "openrouter" && !looksOpenRouter)
    return "OpenRouter keys start with sk-or-. Check that you copied an OpenRouter key.";
  return null;
}

async function balance(provider: ProviderId, apiKey: string): Promise<string | null> {
  try {
    const response = await fetch(
      `${API_BASE[provider]}/${provider === "gateway" ? "credits" : "key"}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        redirect: "error",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) return null;
    const body = await response.json();
    const usd = (value: unknown) =>
      Number.isFinite(Number(value)) && value !== null ? `$${Number(value).toFixed(2)}` : null;
    if (provider === "gateway") {
      const remaining = usd(body?.balance);
      return remaining && `Balance ${remaining}`;
    }
    const remaining = usd(body?.data?.limit_remaining);
    const used = usd(body?.data?.usage);
    return remaining ? `Key limit remaining ${remaining}` : used && `Used ${used} with this key`;
  } catch {
    return null;
  }
}

async function testConnection(provider: ProviderId, requestedModel: unknown) {
  const { apiKey } = await readProviderKey(provider);
  if (!apiKey) return json({ error: `Save a ${PROVIDERS[provider].label} key first.` }, 400);
  const model = pickModel(provider, (await getCatalog(provider)).models, requestedModel);
  if (!model) return json({ error: "No compatible model is available right now." }, 503);
  const response = await fetch(`${API_BASE[provider]}/chat/completions`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: "user", content: "Reply with OK." }],
      max_tokens: 32,
    }),
  });
  await response.body?.cancel();
  if (response.ok) {
    const funds = await balance(provider, apiKey);
    return json({
      ok: true,
      message: `Connected. ${model.name} answered a test request.${funds ? ` ${funds}.` : ""}`,
    });
  }
  const { label } = PROVIDERS[provider];
  const error =
    response.status === 401 || response.status === 403
      ? `${label} rejected this key. Check the key and its account access.`
      : response.status === 402
        ? `${label} needs credits or billing. Top up your balance and try again.`
        : response.status === 429
          ? "The key is rate limited or has reached its limit. Try again later."
          : `${model.name} did not accept the request. Try another model or check your ${label} account.`;
  return json({ error }, 422);
}

export async function handleProviderSettings(request: Request) {
  if (!getPasswordSessionFromHeaders(request.headers))
    return json({ error: "Sign in to manage model providers." }, 401);
  try {
    if (request.method === "GET") return json(await providerStatus());
    if (!hasSameOriginRequest(request)) return json({ error: "Invalid request origin." }, 403);
    if (Date.now() - windowStart > 60_000) {
      windowStart = Date.now();
      attempts = 0;
    }
    if (++attempts > 20) return json({ error: "Too many requests. Try again in a minute." }, 429);
    const body = await readBody(request);
    if (body === "too-large") return json({ error: "Request too large." }, 413);
    if (!body || !isProviderId(body.provider)) return json({ error: "Invalid request." }, 400);
    const provider = body.provider;
    switch (body.action) {
      case "save": {
        const key = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
        const error = keyError(provider, key);
        if (error) return json({ error }, 400);
        await saveProviderKey(provider, key);
        await setActiveProvider(provider);
        return json(await providerStatus());
      }
      case "remove":
        await removeProviderKey(provider);
        return json(await providerStatus());
      case "activate": {
        if (!(await readProviderKey(provider)).apiKey)
          return json({ error: `Add a ${PROVIDERS[provider].label} key first.` }, 400);
        await setActiveProvider(provider);
        return json(await providerStatus());
      }
      case "test":
        return await testConnection(provider, body.model);
      default:
        return json({ error: "Invalid action." }, 400);
    }
  } catch {
    return json(
      { error: "Could not complete the request. Try again or check your server configuration." },
      503,
    );
  }
}
