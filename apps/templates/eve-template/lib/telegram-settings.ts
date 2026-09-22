import { randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { readEncrypted, removeSetting, withSettingsLock, writeEncrypted } from "./secure-settings";

const FILE = "telegram.enc";
const API = "https://api.telegram.org";
const PAIRING_TTL_MS = 10 * 60_000;
const MAX_PAIRING_FAILURES = 5;

export type TelegramConfig = {
  botToken: string;
  webhookSecret: string;
  botUsername: string;
  owner?: { userId: string; chatId: string; username?: string };
  pairing?: { code: string; expiresAt: number; failures?: number };
  updatedAt: string;
};

export async function readTelegram(): Promise<TelegramConfig | undefined> {
  const value = (await readEncrypted(FILE)) as TelegramConfig | undefined;
  if (value === undefined) return undefined;
  if (typeof value.botToken !== "string" || typeof value.webhookSecret !== "string")
    throw new Error("Invalid settings file.");
  return value;
}

async function update(change: (config: TelegramConfig) => TelegramConfig | undefined) {
  return withSettingsLock(FILE, async () => {
    const current = await readTelegram();
    if (!current) throw new Error("Telegram is not connected.");
    const next = change(current);
    if (next) await writeEncrypted(FILE, { ...next, updatedAt: new Date().toISOString() });
    return next;
  });
}

async function botApi(botToken: string, method: string, body?: Record<string, unknown>) {
  const response = await fetch(`${API}/bot${botToken}/${method}`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: Record<string, unknown>;
  };
  return { status: response.status, ok: response.ok && data.ok === true, result: data.result };
}

export class TelegramSetupError extends Error {}

/**
 * Validates the bot token with `getMe`, registers `origin/eve/v1/telegram` as
 * the webhook with a fresh secret, and keeps an existing owner link when the
 * same bot is reconnected.
 */
export async function connectTelegram(botToken: string, origin: string) {
  const me = await botApi(botToken, "getMe");
  if (me.status === 401 || me.status === 404)
    throw new TelegramSetupError(
      "Telegram rejected this bot token. Copy it again from @BotFather.",
    );
  const botUsername = me.result?.username;
  if (!me.ok || typeof botUsername !== "string")
    throw new TelegramSetupError("Could not reach Telegram. Try again in a moment.");
  const webhookSecret = randomBytes(32).toString("hex");
  const hook = await botApi(botToken, "setWebhook", {
    url: `${origin}/eve/v1/telegram`,
    secret_token: webhookSecret,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: true,
  });
  if (!hook.ok)
    throw new TelegramSetupError(
      "Telegram could not register this site as the bot's webhook. The site must be public over HTTPS.",
    );
  const previous = await readTelegram().catch(() => undefined);
  const sameBot = previous?.botUsername === botUsername;
  await withSettingsLock(FILE, () =>
    writeEncrypted(FILE, {
      botToken,
      webhookSecret,
      botUsername,
      owner: sameBot ? previous?.owner : undefined,
      updatedAt: new Date().toISOString(),
    } satisfies TelegramConfig),
  );
}

export async function disconnectTelegram() {
  const config = await readTelegram().catch(() => undefined);
  if (config) await botApi(config.botToken, "deleteWebhook").catch(() => undefined);
  await removeSetting(FILE);
}

export async function startPairing() {
  const code = String(randomInt(100_000, 1_000_000));
  await update((config) => ({
    ...config,
    pairing: { code, expiresAt: Date.now() + PAIRING_TTL_MS },
  }));
  return code;
}

export async function unlinkOwner() {
  await update(({ owner: _owner, ...config }) => config);
}

/**
 * Links the Telegram user who sends a valid, unexpired code. The code works
 * once and is discarded after five wrong attempts.
 */
export async function completePairing(
  code: string,
  owner: { userId: string; chatId: string; username?: string },
) {
  let linked = false;
  await update((config) => {
    const expected = config.pairing;
    if (!expected || expected.expiresAt < Date.now()) return undefined;
    const matches =
      code.length === expected.code.length &&
      timingSafeEqual(Buffer.from(code), Buffer.from(expected.code));
    if (!matches) {
      const failures = (expected.failures ?? 0) + 1;
      const { pairing: _pairing, ...rest } = config;
      return failures >= MAX_PAIRING_FAILURES
        ? rest
        : { ...config, pairing: { ...expected, failures } };
    }
    linked = true;
    const { pairing: _pairing, ...rest } = config;
    return { ...rest, owner };
  });
  return linked;
}

export async function telegramStatus() {
  try {
    const config = await readTelegram();
    if (!config) return { connected: false as const };
    return {
      connected: true as const,
      botUsername: config.botUsername,
      linked: Boolean(config.owner),
      ownerUsername: config.owner?.username ?? null,
      pairingCode:
        config.pairing && config.pairing.expiresAt > Date.now() ? config.pairing.code : null,
    };
  } catch {
    return { connected: false as const, unreadable: true as const };
  }
}
