import type { SessionAuthContext } from "eve/context";

/**
 * The single operator of this self-hosted app. Every channel that proves it is
 * the operator (password login, the linked Telegram account, operator
 * schedules) uses this principal so memory follows the operator across channels.
 */
export const OPERATOR_PRINCIPAL_ID = "eve-chat-user";
const OPERATOR_NAME = "Riki";

/** The memory scope password-login sessions have always used; kept stable so existing memories stay reachable. */
export const OPERATOR_MEMORY_SCOPE = JSON.stringify([
  "user",
  "password",
  "eve-chat-template",
  OPERATOR_PRINCIPAL_ID,
]);

export function operatorAuth(
  authenticator: "password" | "telegram" | "schedule",
  attributes: Record<string, string> = {},
): SessionAuthContext {
  return {
    attributes: {
      ...attributes,
      email: "local@aegentica.local",
      name: OPERATOR_NAME,
      operator: "true",
    },
    authenticator,
    issuer: authenticator === "password" ? "eve-chat-template" : "aegentica",
    principalId: OPERATOR_PRINCIPAL_ID,
    principalType: "user",
    subject: OPERATOR_PRINCIPAL_ID,
  };
}

export function isOperator(auth: SessionAuthContext | null | undefined) {
  return auth?.principalId === OPERATOR_PRINCIPAL_ID && auth.attributes.operator === "true";
}
