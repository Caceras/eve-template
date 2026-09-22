import { PROVIDER_IDS, isModelId, isProviderId, type ProviderId } from "./model-catalog";
import {
  readEncrypted,
  readJson,
  removeSetting,
  withSettingsLock,
  writeEncrypted,
  writeJson,
} from "./secure-settings";

const ENV_KEYS: Record<ProviderId, string> = {
  gateway: "AI_GATEWAY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};
const CHOICE_FILE = "provider.json";
const keyFile = (provider: ProviderId) => `${provider}.enc`;

export type ProviderCredential = {
  apiKey: string;
  updatedAt: string | null;
  source: "app" | "environment" | "none";
};

/** The app-saved key wins over the provider's environment variable. */
export async function readProviderKey(provider: ProviderId): Promise<ProviderCredential> {
  const value = (await readEncrypted(keyFile(provider))) as
    | { apiKey?: unknown; updatedAt?: unknown }
    | undefined;
  if (value === undefined) {
    const apiKey = process.env[ENV_KEYS[provider]]?.trim() || "";
    return { apiKey, updatedAt: null, source: apiKey ? "environment" : "none" };
  }
  if (typeof value.apiKey !== "string" || typeof value.updatedAt !== "string")
    throw new Error("Invalid settings file.");
  return { apiKey: value.apiKey, updatedAt: value.updatedAt, source: "app" };
}

export async function saveProviderKey(provider: ProviderId, apiKey: string) {
  await writeEncrypted(keyFile(provider), { apiKey, updatedAt: new Date().toISOString() });
}

/** Deletes the app-saved key, including an unreadable one; an environment key then applies. */
export async function removeProviderKey(provider: ProviderId) {
  await removeSetting(keyFile(provider));
}

type Choice = { provider?: ProviderId; model?: string };

async function readChoice(): Promise<Choice> {
  try {
    const value = (await readJson(CHOICE_FILE)) as Record<string, unknown> | undefined;
    return {
      provider: isProviderId(value?.provider) ? value.provider : undefined,
      model: isModelId(value?.model) ? value.model : undefined,
    };
  } catch {
    return {};
  }
}

async function updateChoice(patch: Choice) {
  await withSettingsLock(CHOICE_FILE, async () =>
    writeJson(CHOICE_FILE, { ...(await readChoice()), ...patch }),
  );
}

export async function setActiveProvider(provider: ProviderId) {
  await updateChoice({ provider });
}

/** The operator's last model pick; used where no browser sends one (Telegram, schedules). */
export async function readDefaultModel(): Promise<string | undefined> {
  return (await readChoice()).model;
}

export async function setDefaultModel(model: string) {
  await updateChoice({ model });
}

async function hasKey(provider: ProviderId) {
  try {
    return Boolean((await readProviderKey(provider)).apiKey);
  } catch {
    return false;
  }
}

/** The operator's choice, else the first provider with a usable key, else AI Gateway. */
export async function readActiveProvider(): Promise<ProviderId> {
  const { provider } = await readChoice();
  if (provider) return provider;
  for (const candidate of PROVIDER_IDS) if (await hasKey(candidate)) return candidate;
  return "gateway";
}

export type ProviderStatus = {
  configured: boolean;
  source: ProviderCredential["source"] | "unreadable";
  updatedAt: string | null;
};

export async function providerStatus() {
  const entries = await Promise.all(
    PROVIDER_IDS.map(async (provider): Promise<[ProviderId, ProviderStatus]> => {
      try {
        const { apiKey, source, updatedAt } = await readProviderKey(provider);
        return [provider, { configured: Boolean(apiKey), source, updatedAt }];
      } catch {
        return [provider, { configured: false, source: "unreadable", updatedAt: null }];
      }
    }),
  );
  return {
    active: await readActiveProvider(),
    defaultModel: (await readDefaultModel()) ?? null,
    providers: Object.fromEntries(entries) as Record<ProviderId, ProviderStatus>,
  };
}
