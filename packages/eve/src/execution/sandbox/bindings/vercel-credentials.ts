import { getVercelOidcToken } from "#compiled/@vercel/oidc/index.js";
import { decodeVercelOidcTokenClaims } from "#shared/vercel-project.js";
import { withPackageUserAgent } from "#internal/user-agent.js";
import type { VercelCreateOptions } from "#execution/sandbox/bindings/vercel-sdk-types.js";

export function describeVercelSandboxCredentialSources(createOptions: VercelCreateOptions): string {
  return [
    `team:${credentialSource(createOptions, "teamId", "VERCEL_TEAM_ID", "VERCEL_ORG_ID")}`,
    `project:${credentialSource(createOptions, "projectId", "VERCEL_PROJECT_ID")}`,
    `token:${credentialSource(createOptions, "token", "VERCEL_OIDC_TOKEN", "VERCEL_TOKEN")}`,
  ].join(",");
}

export function getVercelSandboxFetch(createOptions: VercelCreateOptions): typeof globalThis.fetch {
  const fetchOverride = Reflect.get(createOptions, "fetch");
  return withPackageUserAgent(typeof fetchOverride === "function" ? fetchOverride : undefined);
}

export async function getVercelSandboxCredentials(
  createOptions: VercelCreateOptions,
): Promise<VercelSandboxCredentials> {
  const teamId =
    readNonEmptyString(createOptions, "teamId") ??
    readNonEmptyEnvironmentVariable("VERCEL_TEAM_ID") ??
    readNonEmptyEnvironmentVariable("VERCEL_ORG_ID");
  const projectId =
    readNonEmptyString(createOptions, "projectId") ??
    readNonEmptyEnvironmentVariable("VERCEL_PROJECT_ID");
  const envToken =
    readNonEmptyString(createOptions, "token") ??
    readNonEmptyEnvironmentVariable("VERCEL_OIDC_TOKEN") ??
    readNonEmptyEnvironmentVariable("VERCEL_TOKEN");

  if (envToken && teamId && projectId) {
    console.info(
      `[eve:sandbox-debug] credentials mode=environment ${describeVercelSandboxCredentialSources(createOptions)}`,
    );
    return { projectId, teamId, token: envToken };
  }

  console.info(
    `[eve:sandbox-debug] credentials mode=oidc teamHint=${teamId === undefined ? "absent" : "present"} projectHint=${projectId === undefined ? "absent" : "present"}`,
  );
  const oidcToken = await getVercelOidcToken({
    project: projectId,
    team: teamId,
  });
  return getVercelSandboxCredentialsFromOidcToken(oidcToken);
}

function credentialSource(
  createOptions: VercelCreateOptions,
  optionKey: string,
  ...environmentKeys: readonly string[]
): string {
  if (readNonEmptyString(createOptions, optionKey) !== undefined) return "option";
  return (
    environmentKeys.find((key) => readNonEmptyEnvironmentVariable(key) !== undefined) ?? "none"
  );
}

function readNonEmptyString(object: object, key: string): string | undefined {
  const value = Reflect.get(object, key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readNonEmptyEnvironmentVariable(key: string): string | undefined {
  const value = process.env[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function getVercelSandboxCredentialsFromOidcToken(token: string): VercelSandboxCredentials {
  const claims = decodeVercelOidcTokenClaims(token);
  if (claims.ownerId === undefined || claims.projectId === undefined) {
    throw new Error("Invalid Vercel OIDC token: missing owner_id or project_id.");
  }

  return { projectId: claims.projectId, teamId: claims.ownerId, token };
}

export interface VercelSandboxCredentials {
  readonly projectId: string;
  readonly teamId: string;
  readonly token: string;
}
