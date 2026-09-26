import {
  collectTelegramFileParts,
  telegramChannel,
  verifyTelegramRequest,
} from "eve/channels/telegram";
import { generatedImageUrls, sendTelegramPhotos } from "@/lib/generated-images";
import { operatorAuth } from "@/lib/operator";
import { completePairing, readTelegram } from "@/lib/telegram-settings";
import { describeTurnFailure } from "@/lib/turn-failure";

async function connected() {
  const config = await readTelegram();
  if (!config) throw new Error("Telegram is not connected. Connect it in Settings.");
  return config;
}

const UPLOADS = {
  allowedMediaTypes: ["image/*", "application/pdf", "text/*"],
  maxBytes: 10 * 1024 * 1024,
};

/**
 * A button press (approval, question) from anyone but the linked account
 * becomes an empty update eve ignores: eve answers button presses without a
 * sender check, and an account that was unlinked still has the buttons.
 */
function ownerButtonsOnly(body: string, ownerUserId: string | undefined) {
  try {
    const update = JSON.parse(body) as { callback_query?: { from?: { id?: unknown } } };
    if (update.callback_query && String(update.callback_query.from?.id) !== ownerUserId)
      return "{}";
  } catch {
    // eve reports a body that is not JSON itself.
  }
  return true;
}

// The bot token and webhook secret live encrypted in Settings, so connecting
// or replacing the bot needs no redeploy. Unconfigured webhooks are rejected.
export default telegramChannel({
  credentials: {
    botToken: async () => (await connected()).botToken,
    // eve's own secret-token check (on a copy: the body is already read; only
    // headers and body matter), then button presses only from the linked account.
    async webhookVerifier(request, body) {
      const config = await connected();
      const copy = new Request("http://localhost/", {
        method: "POST",
        headers: request.headers,
        body,
      });
      await verifyTelegramRequest(copy, { secretToken: config.webhookSecret });
      return ownerButtonsOnly(body, config.owner?.userId);
    },
  },
  events: {
    // Say what went wrong and where to fix it (for example "OpenRouter is out
    // of credits") instead of the generic "try again or rephrase".
    async "turn.failed"(data, channel) {
      await channel.telegram.post(`Something went wrong: ${describeTurnFailure(data)}`);
    },
    // generate_image saves pictures on this server; send them as photos too.
    async "action.result"(data, channel) {
      const urls = generatedImageUrls(data);
      if (urls.length === 0) return;
      try {
        await sendTelegramPhotos((await connected()).botToken, channel.telegram.chatId, urls);
      } catch (error) {
        console.error("[telegram] could not send the generated image", error);
        await channel.telegram.post(
          "The picture is ready in Ægentica; Telegram did not accept it.",
        );
      }
    },
  },
  uploadPolicy: UPLOADS,
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

    // Voice notes, stickers, videos and other files would arrive as an empty message.
    if (
      !message.text.trim() &&
      !message.caption.trim() &&
      collectTelegramFileParts(message.attachments, UPLOADS).length === 0
    ) {
      await ctx.telegram.sendMessage(
        "I can read text, photos, PDFs and text files up to 10 MB. Voice notes, stickers, videos and other files are not supported here yet.",
      );
      return null;
    }

    await ctx.telegram.startTyping();
    return {
      auth: operatorAuth("telegram", { chat_id: message.chat.id, telegram_user_id: user.id }),
    };
  },
});
