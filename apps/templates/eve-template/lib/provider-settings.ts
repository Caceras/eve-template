import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PROVIDER_IDS, isProviderId, type ProviderId } from "./model-catalog";

const ENV_KEYS: Record<ProviderId, string> = {
  gateway: "AI_GATEWAY_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};
const ACTIVE_FILE = "provider.json";
const keyFile = (provider: ProviderId) => `${provider}.enc`;

function settingsDirectory() {
  return (
    process.env.EVE_SETTINGS_DIR ||
    join(
      process.env.EVE_MEMORY_DIR ? dirname(process.env.EVE_MEMORY_DIR) : ".eve/.workflow-data",
      "settings",
    )
  );
}
function encryptionKey() {
  const secret = process.env.EVE_SESSION_SECRET?.trim();
  if (!secret) throw new Error("Settings encryption is not configured.");
  // The label predates OpenRouter support; changing it would orphan saved keys.
  return createHash("sha256")
    .update("aegentica/gateway/v1\0" + secret)
    .digest();
}

export type ProviderCredential = {
  apiKey: string;
  updatedAt: string | null;
  source: "app" | "environment" | "none";
};

/** The app-saved key wins over the provider's environment variable. */
export async function readProviderKey(provider: ProviderId): Promise<ProviderCredential> {
  const file = join(settingsDirectory(), keyFile(provider));
  let raw: string;
  try {
    if ((await stat(file)).size > 8192) throw new Error("Invalid settings file.");
    raw = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const apiKey = process.env[ENV_KEYS[provider]]?.trim() || "";
    return { apiKey, updatedAt: null, source: apiKey ? "environment" : "none" };
  }
  const stored = JSON.parse(raw);
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(stored.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(stored.tag, "base64"));
  const value = JSON.parse(
    Buffer.concat([decipher.update(Buffer.from(stored.data, "base64")), decipher.final()]).toString(
      "utf8",
    ),
  );
  if (typeof value.apiKey !== "string" || typeof value.updatedAt !== "string")
    throw new Error("Invalid settings file.");
  return { apiKey: value.apiKey, updatedAt: value.updatedAt, source: "app" };
}

async function atomicWrite(name: string, data: string) {
  const directory = settingsDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const temp = join(directory, `${name}.${randomBytes(8).toString("hex")}.tmp`);
  await writeFile(temp, data, { mode: 0o600 });
  await rename(temp, join(directory, name));
}

export async function saveProviderKey(provider: ProviderId, apiKey: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const data = Buffer.concat([
    cipher.update(JSON.stringify({ apiKey, updatedAt: new Date().toISOString() }), "utf8"),
    cipher.final(),
  ]);
  await atomicWrite(
    keyFile(provider),
    JSON.stringify({
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      data: data.toString("base64"),
    }),
  );
}

/** Deletes the app-saved key, including an unreadable one; an environment key then applies. */
export async function removeProviderKey(provider: ProviderId) {
  await rm(join(settingsDirectory(), keyFile(provider)), { force: true });
}

export async function setActiveProvider(provider: ProviderId) {
  await atomicWrite(ACTIVE_FILE, JSON.stringify({ provider }));
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
  try {
    const { provider } = JSON.parse(await readFile(join(settingsDirectory(), ACTIVE_FILE), "utf8"));
    if (isProviderId(provider)) return provider;
  } catch {
    /* No explicit choice yet. */
  }
  for (const provider of PROVIDER_IDS) if (await hasKey(provider)) return provider;
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
    providers: Object.fromEntries(entries) as Record<ProviderId, ProviderStatus>,
  };
}
