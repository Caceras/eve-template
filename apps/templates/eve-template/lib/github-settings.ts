import { readEncrypted, removeSetting, writeEncrypted } from "./secure-settings";

/**
 * The operator's GitHub token for the GitHub tools extension, stored encrypted
 * like the provider keys. `GITHUB_TOKEN` in the environment is the fallback.
 */
const FILE = "github.enc";

type GithubConfig = { token: string; login: string; savedAt: string };

export class GithubSetupError extends Error {}

export async function readGithub(): Promise<GithubConfig | undefined> {
  const value = (await readEncrypted(FILE)) as GithubConfig | undefined;
  return value?.token ? value : undefined;
}

export async function githubToken() {
  const token =
    (await readGithub().catch(() => undefined))?.token ?? process.env.GITHUB_TOKEN?.trim();
  if (!token)
    throw new GithubSetupError(
      "GitHub is not connected. Ask the user to add a token in Settings → Integrations → GitHub.",
    );
  return token;
}

async function lookupLogin(token: string) {
  const response = await fetch("https://api.github.com/user", {
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (response.status === 401) throw new GithubSetupError("GitHub rejected this token.");
  if (!response.ok) throw new GithubSetupError("GitHub could not be reached. Try again.");
  const user = (await response.json()) as { login?: string };
  if (!user.login) throw new GithubSetupError("GitHub did not return an account for this token.");
  return user.login;
}

export async function connectGithub(token: string) {
  const login = await lookupLogin(token);
  await writeEncrypted(FILE, { token, login, savedAt: new Date().toISOString() });
  return login;
}

export async function disconnectGithub() {
  await removeSetting(FILE);
}

export async function githubStatus() {
  try {
    const config = await readGithub();
    if (config) return { connected: true as const, login: config.login, source: "app" as const };
  } catch {
    return { connected: false as const, unreadable: true as const };
  }
  return process.env.GITHUB_TOKEN?.trim()
    ? { connected: true as const, login: null, source: "env" as const }
    : { connected: false as const };
}
