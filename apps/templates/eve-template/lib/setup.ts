import type { SetupStatus } from "@/lib/chat/types";
import { isDatabaseConfigured, isDatabaseSchemaReady } from "@/lib/db/client";
import { isChatPasswordConfigured } from "@/lib/password-auth";

const PASSWORD_ENV_KEY = "EVE_CHAT_PASSWORD";
const AUTH_ENV_KEYS = [
  "BETTER_AUTH_SECRET",
  "NEXT_PUBLIC_VERCEL_APP_CLIENT_ID",
  "VERCEL_APP_CLIENT_SECRET",
] as const;

const CONNECTION_ENV_KEYS = {
  linear: "LINEAR_CONNECTOR",
  notion: "NOTION_CONNECTOR",
  sentry: "SENTRY_CONNECTOR",
} as const;

const RATE_LIMIT_ENV_GROUPS = [
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
] as const;

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function isAuthConfigured() {
  return AUTH_ENV_KEYS.every(hasEnv);
}

export function isPasswordConfigured() {
  return isChatPasswordConfigured();
}

export function isRateLimitConfigured() {
  return RATE_LIMIT_ENV_GROUPS.some((group) => group.every(hasEnv));
}

export function getInitialSetupStatus(): SetupStatus {
  return createSetupStatus({
    databaseSchemaReady: isDatabaseConfigured(),
  });
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const databaseConfigured = isDatabaseConfigured();
  const databaseSchemaReady = databaseConfigured ? await isDatabaseSchemaReady() : false;

  return createSetupStatus({ databaseSchemaReady });
}

export async function isAppConfigured() {
  const status = await getSetupStatus();

  return status.appReady;
}

function createSetupStatus({
  databaseSchemaReady,
}: {
  readonly databaseSchemaReady: boolean;
}): SetupStatus {
  const databaseConfigured = isDatabaseConfigured();
  const vercelAuthReady = isAuthConfigured();
  const rateLimitReady = isRateLimitConfigured();
  const databaseReady = databaseConfigured && databaseSchemaReady;
  const fullEnvironmentReady = databaseConfigured && vercelAuthReady && rateLimitReady;
  const passwordReady = isPasswordConfigured();
  const localDevReady = isLocalDevelopment();
  const configuredConnections = localDevReady
    ? (Object.keys(CONNECTION_ENV_KEYS) as (keyof typeof CONNECTION_ENV_KEYS)[])
    : (Object.entries(CONNECTION_ENV_KEYS)
        .filter(([, envKey]) => hasEnv(envKey))
        .map(([key]) => key) as (keyof typeof CONNECTION_ENV_KEYS)[]);
  const connectionsAvailable = configuredConnections.length > 0;

  if (passwordReady || localDevReady) {
    return {
      appReady: true,
      authMode: passwordReady ? "password" : "local-dev",
      authReady: true,
      configuredConnections,
      connectionsAvailable,
      databaseConfigured,
      databaseReady,
      databaseSchemaReady,
      missing: [],
      rateLimitReady,
      storageMode: databaseReady ? "database" : "browser",
    };
  }

  if (fullEnvironmentReady) {
    return {
      appReady: databaseReady,
      authMode: "vercel",
      authReady: vercelAuthReady,
      configuredConnections,
      connectionsAvailable,
      databaseConfigured,
      databaseReady,
      databaseSchemaReady,
      missing: databaseSchemaReady ? [] : ["database migrations"],
      rateLimitReady,
      storageMode: "database",
    };
  }

  return {
    appReady: false,
    authMode: "unconfigured",
    authReady: false,
    connectionsAvailable,
    databaseConfigured,
    databaseReady,
    databaseSchemaReady,
    missing: [
      PASSWORD_ENV_KEY,
      "or DATABASE_URL, Better Auth/Vercel OAuth, and Upstash configuration",
    ],
    rateLimitReady,
    storageMode: "browser",
  };
}

function isLocalDevelopment() {
  return process.env.NODE_ENV === "development" && process.env.VERCEL !== "1";
}
