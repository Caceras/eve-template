import type { MessageStreamEvent } from "eve/client";
import { readMedia } from "./media-store";

type ActionResult = Extract<MessageStreamEvent, { type: "action.result" }>["data"];

/** The `/api/media/…` images a finished `generate_image` call saved. */
export function generatedImageUrls({ result, status }: ActionResult) {
  if (
    status !== "completed" ||
    result.kind !== "tool-result" ||
    result.toolName !== "generate_image"
  )
    return [];
  const images = (result.output as { images?: unknown } | null)?.images;
  if (!Array.isArray(images)) return [];
  return images.flatMap((image: { url?: unknown } | null) =>
    typeof image?.url === "string" && image.url.startsWith("/api/media/") ? [image.url] : [],
  );
}

/**
 * Uploads saved images to a Telegram chat with the Bot API's `sendPhoto`
 * (multipart, since the files live on this server's volume, not at a public URL).
 */
export async function sendTelegramPhotos(
  botToken: string,
  chatId: string,
  urls: readonly string[],
) {
  for (const url of urls) {
    const name = url.slice("/api/media/".length);
    const media = await readMedia(name);
    if (!media) throw new Error(`Image ${name} is missing.`);
    const form = new FormData();
    form.set("chat_id", chatId);
    form.set("photo", new Blob([media.data], { type: media.mediaType }), name);
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(60_000),
      body: form,
    });
    if (!response.ok) throw new Error(`Telegram answered ${response.status}`);
  }
}
