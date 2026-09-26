/**
 * Vercel Connect connectors for the work-app connections (Linear, Notion,
 * Sentry). Shared by the setup status the UI shows and the connections the
 * agent is given, so both agree on what is configured.
 */
export const CONNECTION_ENV_KEYS = {
  linear: "LINEAR_CONNECTOR",
  notion: "NOTION_CONNECTOR",
  sentry: "SENTRY_CONNECTOR",
} as const;

export type WorkApp = keyof typeof CONNECTION_ENV_KEYS;

export function isLocalDevelopment() {
  return process.env.NODE_ENV === "development" && process.env.VERCEL !== "1";
}

/**
 * The connector id a work app should use, or null when none is configured.
 * Without one the connection can only fail (Vercel Connect needs a connector,
 * and a self-hosted server has no Vercel OIDC token), so the agent never sees it.
 */
export function connectorFor(app: WorkApp) {
  const id = process.env[CONNECTION_ENV_KEYS[app]]?.trim();
  return id || (isLocalDevelopment() ? app : null);
}
