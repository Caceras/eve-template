import { defineMemory } from "eve/memory";
import { fileMemory } from "eve/memory/file";
import { byPrincipal } from "eve/memory/scope";
import { durableMemory } from "../lib/durable-memory";
import { OPERATOR_MEMORY_SCOPE, isOperator } from "@/lib/operator";

const directory = process.env.EVE_MEMORY_DIR?.trim();
const hasBlob = Boolean(
  process.env.VERCEL &&
  (process.env.EVE_MEMORY_BLOB_STORE_ID || process.env.EVE_MEMORY_BLOB_READ_WRITE_TOKEN),
);

export default defineMemory({
  description: "Remember stable facts and preferences the caller asks you to keep.",
  provider: fileMemory(directory ? { backend: durableMemory(directory) } : {}),
  scope(context) {
    if (!directory && !hasBlob) return null;
    // Web, Telegram and schedules share the operator's memory.
    if (isOperator(context.session.auth.current)) return OPERATOR_MEMORY_SCOPE;
    return byPrincipal(context);
  },
});
