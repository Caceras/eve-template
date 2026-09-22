import { handleOperatorSettings, json } from "./settings-api";
import {
  TelegramSetupError,
  connectTelegram,
  disconnectTelegram,
  readTelegram,
  startPairing,
  telegramStatus,
  unlinkOwner,
} from "./telegram-settings";

// @BotFather tokens look like 123456789:AA… (numeric bot id, colon, secret).
const BOT_TOKEN = /^\d{5,15}:[A-Za-z0-9_-]{30,60}$/;

function publicOrigin(request: Request) {
  const configured = process.env.BETTER_AUTH_URL?.trim().replace(/\/+$/, "");
  // handleOperatorSettings has already verified Origin matches this host.
  return configured || request.headers.get("origin") || "";
}

export function handleTelegramSettings(request: Request) {
  return handleOperatorSettings(request, {
    read: async () => json(await telegramStatus()),
    async write(body, request) {
      switch (body.action) {
        case "connect": {
          const token = typeof body.botToken === "string" ? body.botToken.trim() : "";
          if (!BOT_TOKEN.test(token))
            return json({ error: "Paste the bot token exactly as @BotFather shows it." }, 400);
          const origin = publicOrigin(request);
          if (!origin.startsWith("https://"))
            return json({ error: "Telegram needs this site to be served over HTTPS." }, 400);
          try {
            await connectTelegram(token, origin);
          } catch (error) {
            if (error instanceof TelegramSetupError) return json({ error: error.message }, 422);
            throw error;
          }
          return json(await telegramStatus());
        }
        case "pair":
          await startPairing();
          return json(await telegramStatus());
        case "unlink":
          await unlinkOwner();
          return json(await telegramStatus());
        case "disconnect":
          await disconnectTelegram();
          return json(await telegramStatus());
        case "test": {
          const config = await readTelegram();
          if (!config?.owner) return json({ error: "Link your Telegram account first." }, 400);
          const response = await fetch(
            `https://api.telegram.org/bot${config.botToken}/sendMessage`,
            {
              method: "POST",
              redirect: "error",
              signal: AbortSignal.timeout(10_000),
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: config.owner.chatId,
                text: "Ægentica test message. Replies here reach your agent.",
              }),
            },
          );
          await response.body?.cancel();
          return response.ok
            ? json({ ok: true, message: "Test message sent. Check Telegram." })
            : json({ error: "Telegram did not deliver the message. Reconnect the bot." }, 422);
        }
        default:
          return json({ error: "Invalid action." }, 400);
      }
    },
  });
}
