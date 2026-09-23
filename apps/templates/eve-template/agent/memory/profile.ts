import { defineMemory } from "eve/memory";
import { fileMemory } from "eve/memory/file";
import { byPrincipal } from "eve/memory/scope";
import { durableMemory } from "../lib/durable-memory";
import { MEMORY_MAX_CHARACTERS, recordOperatorMemoryKey } from "@/lib/memory-store";
import { OPERATOR_MEMORY_SCOPE, isOperator } from "@/lib/operator";

const directory = process.env.EVE_MEMORY_DIR?.trim();
const hasBlob = Boolean(
  process.env.VERCEL &&
  (process.env.EVE_MEMORY_BLOB_STORE_ID || process.env.EVE_MEMORY_BLOB_READ_WRITE_TOKEN),
);

const provider = fileMemory(
  directory
    ? { maxCharacters: MEMORY_MAX_CHARACTERS, backend: durableMemory(directory) }
    : { maxCharacters: MEMORY_MAX_CHARACTERS },
);

export default defineMemory({
  description: "Remember stable facts and preferences the caller asks you to keep.",
  provider: {
    ...provider,
    recall: {
      ...provider.recall,
      "turn.started": (context) => {
        // The document key is opaque; remember which one is the operator's so
        // the Memory page can show and edit it.
        if (directory && isOperator(context.session.auth.current))
          recordOperatorMemoryKey(context.memory.scope.key);
        return provider.recall["turn.started"](context);
      },
    },
  },
  scope(context) {
    if (!directory && !hasBlob) return null;
    // Web, Telegram and schedules share the operator's memory.
    if (isOperator(context.session.auth.current)) return OPERATOR_MEMORY_SCOPE;
    return byPrincipal(context);
  },
});
