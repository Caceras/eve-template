import { createGateway, generateImage } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { PROVIDERS } from "@/lib/model-catalog";
import { saveMedia } from "@/lib/media-store";
import { readActiveProvider, readProviderKey } from "@/lib/provider-settings";

// Available under the same id on AI Gateway and OpenRouter; override per deployment.
const IMAGE_MODEL = process.env.AEGENTICA_IMAGE_MODEL?.trim() || "openai/gpt-image-1-mini";

export default defineTool({
  description:
    "Create an image from a text description with the active model provider. The image is shown to the user in the chat and kept with the conversation. Use when the user asks for a picture, illustration, logo, diagram-like artwork or visual idea.",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(3)
      .max(4000)
      .describe("A detailed visual description: subject, style, composition, colours, mood."),
    aspectRatio: z
      .enum(["1:1", "3:2", "2:3", "16:9", "9:16"])
      .default("1:1")
      .describe("Landscape 3:2 or 16:9, portrait 2:3 or 9:16, square 1:1."),
  }),
  async execute({ prompt, aspectRatio }) {
    const provider = await readActiveProvider();
    const { apiKey } = await readProviderKey(provider);
    if (!apiKey)
      throw new Error(
        `No ${PROVIDERS[provider].label} API key is configured. Add one in Settings.`,
      );
    const model =
      provider === "gateway"
        ? createGateway({ apiKey }).imageModel(IMAGE_MODEL)
        : createOpenRouter({ apiKey }).imageModel(IMAGE_MODEL);
    const { images } = await generateImage({
      model,
      prompt,
      aspectRatio,
      abortSignal: AbortSignal.timeout(120_000),
    });
    const saved = await Promise.all(
      images.map((image) =>
        saveMedia(image.uint8Array, image.mediaType, { prompt, model: IMAGE_MODEL }),
      ),
    );
    return {
      images: saved.map(({ url }) => ({ url, alt: prompt.slice(0, 200) })),
      model: IMAGE_MODEL,
    };
  },
  toModelOutput: (output) => ({
    type: "text",
    value: `Created ${output.images.length} image(s) with ${output.model}; the chat already shows them to the user above your reply. Describe briefly what you made; do not repeat the image URL.`,
  }),
});
