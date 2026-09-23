import {
  MemoryLimitError,
  addMemories,
  memoryDirectory,
  memoryUsage,
  readOperatorMemory,
  removeMemory,
  updateMemory,
} from "./memory-store";
import { handleOperatorSettings, json } from "./settings-api";

const MAX_IMPORT_ITEMS = 60;

/** Splits pasted notes (one per line or bullet, e.g. a ChatGPT memory export) into entries. */
export function splitImport(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, "").trim())
    .filter((line) => line.length > 0)
    .slice(0, MAX_IMPORT_ITEMS);
}

function status() {
  if (!memoryDirectory()) return { available: false as const };
  const memory = readOperatorMemory();
  return { available: true as const, ...memory, usage: memoryUsage(memory.entries) };
}

const validIndex = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

export function handleMemorySettings(request: Request) {
  return handleOperatorSettings(request, {
    read: async () => json(status()),
    async write(body) {
      if (!memoryDirectory())
        return json({ error: "Memory storage is not configured on this server." }, 400);
      try {
        if (body.action === "add" && typeof body.text === "string") addMemories([body.text]);
        else if (body.action === "import" && typeof body.text === "string") {
          const items = splitImport(body.text);
          if (items.length === 0) return json({ error: "Paste at least one line to import." }, 400);
          addMemories(items);
        } else if (
          body.action === "update" &&
          validIndex(body.index) &&
          typeof body.text === "string"
        )
          updateMemory(body.index, body.text);
        else if (body.action === "remove" && validIndex(body.index)) removeMemory(body.index);
        else return json({ error: "Invalid request." }, 400);
      } catch (error) {
        if (error instanceof MemoryLimitError) return json({ error: error.message }, 422);
        throw error;
      }
      return json(status());
    },
  });
}
