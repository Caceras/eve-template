import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^\.\.?\//.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const directory = await mkdtemp(join(tmpdir(), "aegentica-github-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
delete process.env.GITHUB_TOKEN;
const { handleGithubSettings } = await import("../lib/github-settings-handler.ts");
const { githubToken } = await import("../lib/github-settings.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");

const token = "github_pat_" + "A".repeat(60);
globalThis.fetch = async (url, init) => {
  assert.equal(String(url), "https://api.github.com/user");
  return init.headers.Authorization === `Bearer ${token}`
    ? Response.json({ login: "caceras" })
    : new Response("{}", { status: 401 });
};
const cookie = `eve_chat_session=${createPasswordSessionToken()}`;
const call = (body, options = {}) =>
  handleGithubSettings(
    new Request("https://app.test/api/settings/github", {
      method: body ? "POST" : "GET",
      headers: {
        host: "app.test",
        origin: options.origin ?? "https://app.test",
        ...(options.anonymous ? {} : { cookie }),
        "content-type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }),
  );
try {
  assert.equal((await call(undefined, { anonymous: true })).status, 401);
  assert.equal(
    (await call({ action: "connect", token }, { origin: "https://evil.test" })).status,
    403,
  );
  assert.deepEqual(await (await call()).json(), { connected: false });
  await assert.rejects(githubToken(), /Settings → Connections → GitHub/);
  assert.equal((await call({ action: "connect", token: "nope" })).status, 400);
  assert.equal((await call({ action: "connect", token: "ghp_" + "B".repeat(36) })).status, 422);
  const connected = await (await call({ action: "connect", token })).json();
  assert.deepEqual(connected, { connected: true, login: "caceras", source: "app" });
  assert.equal(await githubToken(), token);
  const [file] = await readdir(directory);
  assert(
    !(await readFile(join(directory, file), "utf8")).includes(token),
    "token stored encrypted",
  );
  assert(!JSON.stringify(connected).includes(token), "token never returned");
  await call({ action: "disconnect" });
  await assert.rejects(githubToken(), /not connected/);
  process.env.GITHUB_TOKEN = "ghp_env";
  assert.equal(await githubToken(), "ghp_env");
  assert.equal((await (await call()).json()).source, "env");
  console.log(
    "PASS: GitHub settings auth and CSRF, token format and verification, encrypted storage, never echoed, per-call token with env fallback, disconnect",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
