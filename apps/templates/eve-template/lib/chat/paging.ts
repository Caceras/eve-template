/** The sidebar pages chats 20 at a time; Search asks for up to 100 at once. */
export const CHAT_PAGE_SIZE = 20;
export const MAX_CHAT_PAGE_SIZE = 100;

/** A requested page size, whole and within bounds; anything else is the default. */
export function chatPageSize(limit: unknown) {
  const size = typeof limit === "string" && /^\d+$/.test(limit) ? Number(limit) : limit;
  return typeof size === "number" && Number.isInteger(size) && size > 0
    ? Math.min(size, MAX_CHAT_PAGE_SIZE)
    : CHAT_PAGE_SIZE;
}
