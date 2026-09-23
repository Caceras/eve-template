import { deleteMedia, listMedia } from "./media-store";
import { handleOperatorSettings, json } from "./settings-api";
export function handleMediaLibrary(request: Request) {
  return handleOperatorSettings(request, {
    read: async () => {
      const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
      if (!Number.isInteger(offset) || offset < 0 || offset > 1000)
        return json({ error: "Invalid page." }, 400);
      return json(await listMedia(offset));
    },
    write: async (body) =>
      body.action === "delete" && typeof body.name === "string" && (await deleteMedia(body.name))
        ? json({ deleted: true })
        : json({ error: "Invalid image." }, 400),
  });
}
