import { telegramChannel } from "eve/channels/telegram";
import { operatorAuth } from "@/lib/operator";
import { completePairing, readTelegram } from "@/lib/telegram-settings";

async function connected() {
  const config = await readTelegram();
  if (!config) throw new Error("Telegram is not connected. Connect it in Settings.");
  return config;
}

// The bot token and webhook secret live encrypted in Settings, so connecting
// or replacing the bot needs no redeploy. Unconfigured webhooks are rejected.
export default telegramChannel({
  credentials: {
    botToken: async () => (await connected()).botToken,
    webhookSecretToken: async () => (await connected()).webhookSecret,
  },
  uploadPolicy: {
    allowedMediaTypes: ["image/*", "application/pdf", "text/*"],
    maxBytes: 10 * 1024 * 1024,
  },
  // Only the operator's linked account, in a private chat, reaches the agent.
  async onMessage(ctx, message) {
    const config = await readTelegram();
    const user = message.from;
    if (!config || !user || user.isBot || message.chat.type !== "private") return null;

    // `/link 123456`, or `/start link123456` from the one-tap t.me link in Settings.
    const code = /^\/(?:link\s+|start\s+link)(\d{6})$/.exec(message.text.trim())?.[1];
    if (code) {
      const linked = await completePairing(code, {
        userId: user.id,
        chatId: message.chat.id,
        username: user.username,
      });
      await ctx.telegram.sendMessage(
        linked
          ? "Linked. Ægentica now answers you here and can send your reminders."
          : "That code is wrong or expired. Create a new one in Ægentica Settings.",
      );
      return null;
    }

    if (config.owner?.userId !== user.id) {
      if (!config.owner && message.text.trim() === "/start")
        await ctx.telegram.sendMessage(
          "This is a private Ægentica bot. Open Settings in Ægentica and send the link code shown there.",
        );
      return null;
    }

    await ctx.telegram.startTyping();
    return {
      auth: operatorAuth("telegram", { chat_id: message.chat.id, telegram_user_id: user.id }),
    };
  },
});
