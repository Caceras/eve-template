import { isDatabaseConfigured } from "@/lib/db/client";
import * as postgres from "@/lib/db/pg-queries";
import * as sqlite from "@/lib/db/sqlite-queries";

// Postgres (Neon) when DATABASE_URL is set; otherwise the self-hosted SQLite
// file on the persistent volume. Both expose the same functions.
const store = (): typeof postgres => (isDatabaseConfigured() ? postgres : sqlite);

export const listChatsByUser: typeof postgres.listChatsByUser = (...args) =>
  store().listChatsByUser(...args);
export const listChatsPageByUser: typeof postgres.listChatsPageByUser = (...args) =>
  store().listChatsPageByUser(...args);
export const createChat: typeof postgres.createChat = (...args) => store().createChat(...args);
export const chatExistsForUser: typeof postgres.chatExistsForUser = (...args) =>
  store().chatExistsForUser(...args);
export const getChatForUser: typeof postgres.getChatForUser = (...args) =>
  store().getChatForUser(...args);
export const markChatPendingMessage: typeof postgres.markChatPendingMessage = (...args) =>
  store().markChatPendingMessage(...args);
export const clearChatPendingMessage: typeof postgres.clearChatPendingMessage = (...args) =>
  store().clearChatPendingMessage(...args);
export const skipChatAuthorization: typeof postgres.skipChatAuthorization = (...args) =>
  store().skipChatAuthorization(...args);
export const saveChatSessionState: typeof postgres.saveChatSessionState = (...args) =>
  store().saveChatSessionState(...args);
export const forgetChatSession: typeof postgres.forgetChatSession = (...args) =>
  store().forgetChatSession(...args);
export const appendChatEvent: typeof postgres.appendChatEvent = (...args) =>
  store().appendChatEvent(...args);
export const saveChatSnapshot: typeof postgres.saveChatSnapshot = (...args) =>
  store().saveChatSnapshot(...args);
export const renameChatForUser: typeof postgres.renameChatForUser = (...args) =>
  store().renameChatForUser(...args);
export const deleteChatForUser: typeof postgres.deleteChatForUser = (...args) =>
  store().deleteChatForUser(...args);
