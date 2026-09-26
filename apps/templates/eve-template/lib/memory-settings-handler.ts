import {
  MemoryLimitError,
  addMemories,
  memoryDirectory,
  memoryUsage,
  normalizeMemoryText,
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
    .filter((line) => line.length > 0);
}

/**
 * Imports pasted notes and reports what happened. More lines than one import
 * takes are refused as a whole rather than cut off unseen.
 */
function importMemories(text: string) {
  const items = splitImport(text);
  if (items.length === 0) return { error: "Paste at least one line to import." };
  if (items.length > MAX_IMPORT_ITEMS)
    return {
      error: `Import up to ${MAX_IMPORT_ITEMS} lines at a time; this has ${items.length}. Import the rest in a second go.`,
    };
  const pasted = new Set(items.map(normalizeMemoryText));
  const before = new Set(readOperatorMemory().entries.map((entry) => entry.text));
  const added = addMemories(items).filter(
    (entry) => pasted.has(entry.text) && !before.has(entry.text),
  ).length;
  // Lines already saved, and repeats within the paste, are skipped.
  return { imported: { added, skipped: items.length - added } };
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
    // Room for a pasted import past the memory limit, so the reply can say "Memory is full".
    maxBytes: 65_536,
    async write(body) {
      if (!memoryDirectory())
        return json({ error: "Memory storage is not configured on this server." }, 400);
      try {
        if (body.action === "add" && typeof body.text === "string") addMemories([body.text]);
        else if (body.action === "import" && typeof body.text === "string") {
          const result = importMemories(body.text);
          if ("error" in result) return json({ error: result.error }, 400);
          return json({ ...status(), ...result });
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
