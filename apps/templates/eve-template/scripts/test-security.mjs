import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) specifier = pathToFileURL(join(root, specifier.slice(2))).href;
    try {
      return next(specifier, context);
    } catch (error) {
      if (/^(\.\.?\/|file:)/.test(specifier) && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      // next/server has no exports map; the bundler resolves it, plain Node needs the file.
      if (specifier === "next/server") return next("next/server.js", context);
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
const { POST: logout } = await import("../app/api/password-auth/logout/route.ts");
const oldPassword = process.env.EVE_CHAT_PASSWORD;
const oldToken = auth.createPasswordSessionToken();
const origin = "https://fixture.test";
const request = (method, body, token = oldToken, extra = {}) =>
  new Request(origin + "/api/settings/security", {
    method,
    headers: {
      host: "fixture.test",
      origin,
      "content-type": "application/json",
      cookie: `eve_chat_session=${token}`,
      ...extra,
    },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
  });
try {
  assert.equal((await handleSecurity(request("GET", null, "invalid"))).status, 401);
  const publicStatus = await (await handleSecurity(request("GET"))).json();
  assert.equal(publicStatus.requiresChange, false);
  assert.equal(JSON.stringify(publicStatus).includes(oldPassword), false);
  assert.equal(
    (await handleSecurity(request("POST", {}, oldToken, { origin: "https://other.test" }))).status,
    403,
  );
  assert.equal((await handleSecurity(request("POST", { padding: "x".repeat(3000) }))).status, 413);
  assert.equal(
    (await handleSecurity(request("POST", { currentPassword: oldPassword, newPassword: "short" })))
      .status,
    400,
  );
  assert.equal(
    (
      await handleSecurity(
        request("POST", { currentPassword: "wrong", newPassword: "a-long-fixture-password" }),
      )
    ).status,
    401,
  );
  await writeEncrypted("fixture.enc.json", { apiKey: "fake-fixture-key" });
  const replacement = randomBytes(32).toString("hex");
  const changed = await handleSecurity(
    request("POST", { currentPassword: oldPassword, newPassword: replacement }),
  );
  assert.equal(changed.status, 200);
  assert.equal(auth.verifyPasswordSessionToken(oldToken), false);
  const newToken = decodeURIComponent(
    changed.headers.get("set-cookie").split(";")[0].split("=")[1],
  );
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
  const attempts = await Promise.all(
    [1, 2].map(() =>
      handleSecurity(
        request(
          "POST",
          {
            currentPassword: replacement,
            newPassword: randomBytes(32).toString("hex"),
          },
          newToken,
        ),
      ),
    ),
  );
  assert.deepEqual(attempts.map((item) => item.status).sort(), [200, 401]);

  // Sign out everywhere with a saved password: a new revision, same password.
  const recordFile = join(directory, auth.PASSWORD_RECORD_NAME);
  const beforeRotation = auth.createPasswordSessionToken();
  const recordBefore = JSON.parse(await readFile(recordFile, "utf8"));
  assert.equal(
    (await handleSecurity(request("POST", { signOutEverywhere: true, x: 1 }, beforeRotation)))
      .status,
    400,
  );
  const rotated = await handleSecurity(
    request("POST", { signOutEverywhere: true }, beforeRotation),
  );
  assert.equal(rotated.status, 200);
  assert.match(rotated.headers.get("set-cookie"), /eve_chat_session=;.*Max-Age=0/);
  assert.equal(auth.verifyPasswordSessionToken(beforeRotation), false, "every session ends");
  const recordAfter = JSON.parse(await readFile(recordFile, "utf8"));
  assert.notEqual(recordAfter.revision, recordBefore.revision);
  assert.equal(recordAfter.digest, recordBefore.digest, "the password is unchanged");
  assert.equal(recordAfter.changedAt, recordBefore.changedAt);
  assert.equal(auth.verifyPasswordSessionToken(auth.createPasswordSessionToken()), true);
  const validToken = auth.createPasswordSessionToken();
  await writeFile(join(directory, auth.PASSWORD_RECORD_NAME), "{}");
  assert.equal(auth.isChatPasswordConfigured(), false);
  assert.equal(
    auth.getPasswordSessionFromHeaders(new Headers({ cookie: `eve_chat_session=${validToken}` })),
    false,
  );
  await rm(join(directory, auth.PASSWORD_RECORD_NAME));
  const environmentToken = auth.createPasswordSessionToken();
  process.env.EVE_CHAT_PASSWORD = randomBytes(24).toString("hex");
  assert.equal(auth.verifyPasswordSessionToken(environmentToken), false);

  // Signing out revokes that cookie on the server, so a copy of it stops working.
  const signOut = (token, extra = {}) =>
    logout(
      new Request(origin + "/api/password-auth/logout", {
        method: "POST",
        headers: { host: "fixture.test", origin, cookie: `eve_chat_session=${token}`, ...extra },
      }),
    );
  // Two sign-ins in the same second still get different tokens (a random id in each).
  const now = Date.now();
  const copied = auth.createPasswordSessionToken(now);
  const other = auth.createPasswordSessionToken(now);
  assert.notEqual(copied, other);
  assert.match(copied, /^v3\.\d+\.[\w-]{16}\.[\w-]+$/);
  assert.equal((await signOut(copied, { origin: "https://other.test" })).status, 403);
  assert.equal(auth.verifyPasswordSessionToken(copied), true);
  const signedOut = await signOut(copied);
  assert.equal(signedOut.status, 200);
  assert.match(signedOut.headers.get("set-cookie"), /eve_chat_session=;/);
  assert.equal(auth.verifyPasswordSessionToken(copied), false, "a copied cookie stops working");
  assert.equal(auth.verifyPasswordSessionToken(other), true, "other sessions stay");
  const revokedFile = join(directory, auth.REVOKED_SESSIONS_NAME);
  assert.equal((await stat(revokedFile)).mode & 0o777, 0o600);
  assert.equal((await readFile(revokedFile, "utf8")).includes(copied), false, "only a hash");
  assert.equal((await signOut("v2.4102444800.forged")).status, 200, "an invalid cookie clears");
  assert.equal(Object.keys(JSON.parse(await readFile(revokedFile, "utf8"))).length, 1);
  // Expired entries go on the next write; the other process's writes are seen at once.
  const stale = { ["0".repeat(64)]: 1, ...JSON.parse(await readFile(revokedFile, "utf8")) };
  await writeFile(revokedFile, JSON.stringify(stale));
  await signOut(other);
  assert.equal(auth.verifyPasswordSessionToken(other), false);
  assert.equal(
    Object.keys(JSON.parse(await readFile(revokedFile, "utf8"))).includes("0".repeat(64)),
    false,
  );
  await writeFile(revokedFile, "[]");
  assert.equal(
    auth.getPasswordSessionFromHeaders(
      new Headers({ cookie: `eve_chat_session=${auth.createPasswordSessionToken()}` }),
    ),
    false,
    "a corrupt revocation list fails closed",
  );
  await rm(revokedFile);

  // Sign out everywhere without a saved password: a signing nonce instead.
  const beforeNonce = auth.createPasswordSessionToken(Date.now() - 2000);
  const everywhere = await handleSecurity(
    request("POST", { signOutEverywhere: true }, beforeNonce),
  );
  assert.equal(everywhere.status, 200);
  assert.equal(auth.verifyPasswordSessionToken(beforeNonce), false);
  assert(existsSync(join(directory, auth.SESSION_NONCE_NAME)));
  assert.equal(existsSync(recordFile), false, "no password record is created");
  assert.equal(auth.verifyPasswordSessionToken(auth.createPasswordSessionToken()), true);
  console.log(
    "PASS: private status, CSRF/body bounds, password validation, salted scrypt, revocation, concurrency, unchanged encrypted settings, fail-closed corruption, sign-out revokes the cookie server-side, Sign out everywhere with a saved or environment password",
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}
