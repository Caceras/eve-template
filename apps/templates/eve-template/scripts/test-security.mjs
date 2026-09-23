import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try { return next(specifier, context); } catch (error) {
      if (/^(\.\.?\/|file:)/.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const directory = await mkdtemp(join(tmpdir(), "aegentica-security-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.EVE_CHAT_USERNAME = "Test operator";
process.env.EVE_CHAT_PASSWORD = randomBytes(24).toString("hex");
const auth = await import("../lib/password-auth.ts");
const { handleSecurity } = await import("../lib/security-handler.ts");
const { writeEncrypted, readEncrypted } = await import("../lib/secure-settings.ts");
const oldPassword = process.env.EVE_CHAT_PASSWORD;
const oldToken = auth.createPasswordSessionToken();
const origin = "https://fixture.test";
const request = (method, body, token = oldToken, extra = {}) => new Request(origin + "/api/settings/security", {
  method, headers: { host: "fixture.test", origin, "content-type": "application/json", cookie: `eve_chat_session=${token}`, ...extra },
  ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
});
try {
  assert.equal((await handleSecurity(request("GET", null, "invalid"))).status, 401);
  const publicStatus = await (await handleSecurity(request("GET"))).json();
  assert.equal(publicStatus.requiresChange, false);
  assert.equal(JSON.stringify(publicStatus).includes(oldPassword), false);
  assert.equal((await handleSecurity(request("POST", {}, oldToken, { origin: "https://other.test" }))).status, 403);
  assert.equal((await handleSecurity(request("POST", { padding: "x".repeat(3000) }))).status, 413);
  assert.equal((await handleSecurity(request("POST", { currentPassword: oldPassword, newPassword: "short" }))).status, 400);
  assert.equal((await handleSecurity(request("POST", { currentPassword: "wrong", newPassword: "a-long-fixture-password" }))).status, 401);
  await writeEncrypted("fixture.enc.json", { apiKey: "fake-fixture-key" });
  const replacement = randomBytes(32).toString("hex");
  const changed = await handleSecurity(request("POST", { currentPassword: oldPassword, newPassword: replacement }));
  assert.equal(changed.status, 200);
  assert.equal(auth.verifyPasswordSessionToken(oldToken), false);
  const newToken = decodeURIComponent(changed.headers.get("set-cookie").split(";")[0].split("=")[1]);
  assert.equal(auth.verifyPasswordSessionToken(newToken), true);
  assert.equal(await auth.verifyChatPassword(oldPassword, "Test operator"), false);
  assert.equal(await auth.verifyChatPassword(replacement, "Test operator"), true);
  assert.equal(await auth.verifyChatPassword(replacement, "other"), false);
  assert.deepEqual(await readEncrypted("fixture.enc.json"), { apiKey: "fake-fixture-key" });
  const stored = await readFile(join(directory, auth.PASSWORD_RECORD_NAME), "utf8");
  assert.equal(stored.includes(replacement), false);
  assert.equal(stored.includes(oldPassword), false);
  assert.equal(auth.passwordSettings().requiresChange, false);
  assert.equal((await handleSecurity(request("GET", null, oldToken))).status, 401);
  const attempts = await Promise.all([1, 2].map(() => handleSecurity(request("POST", {
    currentPassword: replacement, newPassword: randomBytes(32).toString("hex"),
  }, newToken))));
  assert.deepEqual(attempts.map((item) => item.status).sort(), [200, 401]);
  const validToken = auth.createPasswordSessionToken();
  await writeFile(join(directory, auth.PASSWORD_RECORD_NAME), "{}");
  assert.equal(auth.isChatPasswordConfigured(), false);
  assert.equal(auth.getPasswordSessionFromHeaders(new Headers({ cookie: `eve_chat_session=${validToken}` })), false);
  await rm(join(directory, auth.PASSWORD_RECORD_NAME));
  const environmentToken = auth.createPasswordSessionToken();
  process.env.EVE_CHAT_PASSWORD = randomBytes(24).toString("hex");
  assert.equal(auth.verifyPasswordSessionToken(environmentToken), false);
  console.log("PASS: private status, CSRF/body bounds, password validation, salted scrypt, revocation, concurrency, unchanged encrypted settings and fail-closed corruption");
} finally { await rm(directory, { recursive: true, force: true }); }
