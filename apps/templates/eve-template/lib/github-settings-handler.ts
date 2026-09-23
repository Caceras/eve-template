import { GithubSetupError, connectGithub, disconnectGithub, githubStatus } from "./github-settings";
import { handleOperatorSettings, json } from "./settings-api";

// Classic (ghp_), fine-grained (github_pat_) and OAuth/app tokens (gho_, ghu_, ghs_).
const GITHUB_TOKEN = /^(gh[pousr]_[A-Za-z0-9]{30,255}|github_pat_[A-Za-z0-9_]{40,255})$/;

export function handleGithubSettings(request: Request) {
  return handleOperatorSettings(request, {
    read: async () => json(await githubStatus()),
    async write(body) {
      if (body.action === "disconnect") {
        await disconnectGithub();
        return json(await githubStatus());
      }
      if (body.action !== "connect") return json({ error: "Invalid action." }, 400);
      const token = typeof body.token === "string" ? body.token.trim() : "";
      if (!GITHUB_TOKEN.test(token))
        return json(
          { error: "Paste a GitHub personal access token (starts with github_pat_ or ghp_)." },
          400,
        );
      try {
        await connectGithub(token);
      } catch (error) {
        if (error instanceof GithubSetupError) return json({ error: error.message }, 422);
        throw error;
      }
      return json(await githubStatus());
    },
  });
}
