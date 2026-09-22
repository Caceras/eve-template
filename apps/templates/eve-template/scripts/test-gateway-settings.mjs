import { registerHooks } from "node:module";
registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (specifier.startsWith("./") && !specifier.split("/").at(-1).includes("."))
        return next(specifier + ".ts", context);
      throw error;
    }
  },
});
const assert = (await import("node:assert/strict")).default;
const { mkdtemp, readFile, rm, writeFile, stat } = await import("node:fs/promises");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { randomBytes } = await import("node:crypto");
const { spawnSync } = await import("node:child_process");
const { readGatewayCredential, gatewayStatus, markGatewayApplied } =
  await import("../lib/gateway-settings.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");
const { handleGatewaySettings } = await import("../lib/gateway-settings-handler.ts");
const directory = await mkdtemp(join(tmpdir(), "aegentica-keys-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.AI_GATEWAY_API_KEY = "test-environment-credential";
const originalFetch = globalThis.fetch;
const fakeKey = "test-user-key-" + randomBytes(24).toString("hex");
const cookie = `eve_chat_session=${createPasswordSessionToken()}`;
function request(body, options = {}) {
  return new Request("https://app.test/api/settings/gateway", {
    method: body === undefined ? "GET" : "POST",
    headers: {
      host: "app.test",
      origin: options.origin || "https://app.test",
      ...(options.anonymous ? {} : { cookie }),
      "content-type": "application/json",
    },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  });
}
try {
  assert.equal((await handleGatewaySettings(request(undefined, { anonymous: true }))).status, 401);
  assert.equal(
    (await handleGatewaySettings(request({ action: "save", apiKey: fakeKey }, { anonymous: true })))
      .status,
    401,
  );
  assert.equal(
    (
      await handleGatewaySettings(
        request({ action: "save", apiKey: fakeKey }, { origin: "https://evil.test" }),
      )
    ).status,
    403,
  );
  assert.equal((await handleGatewaySettings(request("x".repeat(5000)))).status, 413);
  assert.equal((await handleGatewaySettings(request("{"))).status, 400);
  assert.equal(
    (await handleGatewaySettings(request({ action: "save", apiKey: "short" }))).status,
    400,
  );
  assert.equal((await readGatewayCredential()).source, "environment");
  const saved = await handleGatewaySettings(request({ action: "save", apiKey: fakeKey }));
  assert.equal(saved.status, 200);
  assert.equal((await saved.text()).includes(fakeKey), false);
  const encrypted = await readFile(join(directory, "gateway.enc"), "utf8");
  assert.equal(encrypted.includes(fakeKey), false);
  assert.equal((await stat(join(directory, "gateway.enc"))).mode & 0o777, 0o600);
  assert.equal((await readGatewayCredential()).apiKey, fakeKey);
  assert.equal((await gatewayStatus()).active, false);
  const subprocess = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import {readGatewayCredential} from "./lib/gateway-settings.ts"; const c=await readGatewayCredential();process.stdout.write(c.source);',
    ],
    { encoding: "utf8" },
  );
  assert.equal(subprocess.status, 0);
  assert.equal(subprocess.stdout, "app");
  await markGatewayApplied((await readGatewayCredential()).revision);
  assert.equal((await gatewayStatus()).active, true);
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "https://ai-gateway.vercel.sh/v1/chat/completions");
    assert.equal(options.headers.Authorization, `Bearer ${fakeKey}`);
    return new Response(JSON.stringify({ secret: fakeKey }), { status: 401 });
  };
  const rejected = await handleGatewaySettings(request({ action: "test" }));
  assert.equal(rejected.status, 422);
  assert.equal((await rejected.text()).includes(fakeKey), false);
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  assert.equal((await handleGatewaySettings(request({ action: "test" }))).status, 200);
  const ciphertext = JSON.parse(encrypted);
  ciphertext.tag = randomBytes(16).toString("base64");
  await writeFile(join(directory, "gateway.enc"), JSON.stringify(ciphertext));
  assert.equal((await handleGatewaySettings(request())).status, 503);
  await writeFile(join(directory, "gateway.enc"), encrypted);
  process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
  await assert.rejects(readGatewayCredential());
  console.log(
    "PASS: auth, CSRF, bounded input, encrypted storage, cross-process persistence, permissions, activation, provider outcomes and tamper/secret-rotation fail-closed behavior",
  );
} finally {
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
}
