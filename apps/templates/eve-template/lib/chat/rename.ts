export const MAX_CHAT_TITLE_LENGTH = 120;

/** A chat name the operator typed: one line, trimmed and bounded; null when nothing is left. */
export function normalizeChatTitle(input: string) {
  const text = input.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT_TITLE_LENGTH).trimEnd();
  return text || null;
}
