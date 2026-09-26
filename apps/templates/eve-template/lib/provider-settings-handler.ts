import { PROVIDERS, isModelId, isProviderId, pickModel, type ProviderId } from "./model-catalog";
import { getCatalog } from "./provider-catalog";
import {
  providerStatus,
  readProviderKey,
  removeProviderKey,
  saveProviderKey,
  setActiveProvider,
  setDefaultModel,
} from "./provider-settings";
import { handleOperatorSettings, json } from "./settings-api";

const API_BASE: Record<ProviderId, string> = {
  gateway: "https://ai-gateway.vercel.sh/v1",
  openrouter: "https://openrouter.ai/api/v1",
};
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
  const { label } = PROVIDERS[provider];
  let response: Response;
  try {
    response = await fetch(`${API_BASE[provider]}/chat/completions`, {
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
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return json(
      {
        error: timedOut
          ? `${label} did not answer within 30 seconds. Try again or pick a faster model.`
          : `Could not reach ${label} from the server. Try again in a moment.`,
      },
      502,
    );
  }
  // OpenRouter can answer 200 with an error body when generation fails upstream.
  const body = (await response.json().catch(() => null)) as {
    choices?: unknown[];
    error?: { code?: unknown; message?: unknown };
  } | null;
  const status = response.ok && !body?.error ? 200 : Number(body?.error?.code) || response.status;
  if (status === 200 && Array.isArray(body?.choices)) {
    const funds = await balance(provider, apiKey);
    return json({
      ok: true,
      message: `Connected. ${model.name} answered a test request.${funds ? ` ${funds}.` : ""}`,
    });
  }
  const error =
    status === 401
      ? `${label} rejected this key. Check the key and its account access.`
      : status === 402
        ? `${label} needs credits or billing. Top up your balance and try again.`
        : status === 403
          ? `${label} refused the request: the key may lack access to ${model.name}, or the account needs billing details or has reached a limit. Check your ${label} account.`
          : status === 429
            ? "The key is rate limited or has reached its limit. Try again later."
            : `${model.name} did not accept the request. Try another model or check your ${label} account.`;
  return json({ error }, 422);
}

export function handleProviderSettings(request: Request) {
  return handleOperatorSettings(request, {
    read: async () => json(await providerStatus()),
    async write(body) {
      if (body.action === "model") {
        if (!isModelId(body.model)) return json({ error: "Invalid model." }, 400);
        await setDefaultModel(body.model);
        return json(await providerStatus());
      }
      if (!isProviderId(body.provider)) return json({ error: "Invalid request." }, 400);
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
        case "remove": {
          await removeProviderKey(provider);
          // Removing the active provider's only key would stop every chat; switch
          // to the other provider when it still has a key.
          const status = await providerStatus();
          const other = provider === "gateway" ? "openrouter" : "gateway";
          if (
            status.active === provider &&
            !status.providers[provider].configured &&
            status.providers[other].configured
          ) {
            await setActiveProvider(other);
            return json(await providerStatus());
          }
          return json(status);
        }
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
    },
  });
}
