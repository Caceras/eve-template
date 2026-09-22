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
const { readProviderKey, readActiveProvider, providerStatus } =
  await import("../lib/provider-settings.ts");
const { createPasswordSessionToken } = await import("../lib/password-auth.ts");
const { handleProviderSettings } = await import("../lib/provider-settings-handler.ts");
const directory = await mkdtemp(join(tmpdir(), "aegentica-keys-"));
process.env.EVE_SETTINGS_DIR = directory;
process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
process.env.AI_GATEWAY_API_KEY = "test-environment-credential";
delete process.env.OPENROUTER_API_KEY;
const originalFetch = globalThis.fetch;
const gatewayKey = "test-gateway-key-" + randomBytes(24).toString("hex");
const openrouterKey = "sk-or-v1-" + randomBytes(32).toString("hex");
const cookie = `eve_chat_session=${createPasswordSessionToken()}`;
function request(body, options = {}) {
  return new Request("https://app.test/api/settings/providers", {
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
const call = async (body, options) => handleProviderSettings(request(body, options));
try {
  // Authorization, CSRF and input bounds.
  assert.equal((await call(undefined, { anonymous: true })).status, 401);
  assert.equal(
    (await call({ action: "save", provider: "gateway", apiKey: gatewayKey }, { anonymous: true }))
      .status,
    401,
  );
  assert.equal(
    (
      await call(
        { action: "save", provider: "gateway", apiKey: gatewayKey },
        { origin: "https://evil.test" },
      )
    ).status,
    403,
  );
  assert.equal((await call("x".repeat(17_000))).status, 413);
  assert.equal((await call("{")).status, 400);
  assert.equal((await call({ action: "save", provider: "other", apiKey: gatewayKey })).status, 400);
  assert.equal((await call({ action: "save", provider: "gateway", apiKey: "short" })).status, 400);
  // Keys saved under the wrong provider are caught before storage.
  assert.equal(
    (await call({ action: "save", provider: "gateway", apiKey: openrouterKey })).status,
    400,
  );
  assert.equal(
    (await call({ action: "save", provider: "openrouter", apiKey: gatewayKey })).status,
    400,
  );
  assert.equal((await call({ action: "activate", provider: "openrouter" })).status, 400);

  // Environment fallback before anything is saved.
  let status = await (await call()).json();
  assert.equal(status.active, "gateway");
  assert.equal(status.providers.gateway.source, "environment");
  assert.equal(status.providers.openrouter.source, "none");

  // Saving encrypts, never echoes the key, and activates that provider.
  for (const [provider, key] of [
    ["gateway", gatewayKey],
    ["openrouter", openrouterKey],
  ]) {
    const saved = await call({ action: "save", provider, apiKey: key });
    assert.equal(saved.status, 200);
    const text = await saved.text();
    assert.equal(text.includes(key), false);
    assert.equal(JSON.parse(text).active, provider);
    const file = join(directory, `${provider}.enc`);
    assert.equal((await readFile(file, "utf8")).includes(key), false);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.equal((await readProviderKey(provider)).apiKey, key);
  }
  assert.equal(await readActiveProvider(), "openrouter");

  // A separate process (the eve runtime) sees the same active provider and key.
  const subprocess = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      'import {registerHooks} from "node:module"; registerHooks({resolve:(s,c,n)=>{try{return n(s,c)}catch(e){return n(s+".ts",c)}}}); const {readActiveProvider, readProviderKey}=await import("./lib/provider-settings.ts"); const p=await readActiveProvider(); process.stdout.write(p+":"+(await readProviderKey(p)).source);',
    ],
    { encoding: "utf8", env: process.env },
  );
  assert.equal(subprocess.status, 0, subprocess.stderr);
  assert.equal(subprocess.stdout, "openrouter:app");

  // Switching back is instant and needs no key re-entry.
  status = await (await call({ action: "activate", provider: "gateway" })).json();
  assert.equal(status.active, "gateway");

  // Connection tests hit the right endpoint with the right key and never leak it.
  const seen = [];
  globalThis.fetch = async (url, options) => {
    seen.push(String(url));
    if (String(url).endsWith("/models")) throw new Error("offline");
    if (String(url).endsWith("/chat/completions")) {
      const body = JSON.parse(options.body);
      assert.equal(typeof body.model, "string");
      if (String(url).startsWith("https://openrouter.ai/")) {
        assert.equal(options.headers.Authorization, `Bearer ${openrouterKey}`);
        return new Response(JSON.stringify({ secret: openrouterKey }), { status: 402 });
      }
      assert.equal(options.headers.Authorization, `Bearer ${gatewayKey}`);
      return new Response("{}", { status: 200 });
    }
    if (String(url).endsWith("/credits"))
      return Response.json({ balance: "12.5", total_used: "1" });
    return new Response("{}", { status: 404 });
  };
  const ok = await (
    await call({ action: "test", provider: "gateway", model: "anthropic/claude-sonnet-5" })
  ).json();
  assert.match(ok.message, /Claude Sonnet 5 answered.*Balance \$12\.50/);
  const rejected = await call({ action: "test", provider: "openrouter" });
  assert.equal(rejected.status, 422);
  const rejectedText = await rejected.text();
  assert.equal(rejectedText.includes(openrouterKey), false);
  assert.match(rejectedText, /credits/);
  assert(seen.includes("https://ai-gateway.vercel.sh/v1/chat/completions"));
  assert(seen.includes("https://openrouter.ai/api/v1/chat/completions"));
  globalThis.fetch = originalFetch;

  // Tampered or undecryptable keys fail closed per provider and can be removed from the UI.
  const encrypted = await readFile(join(directory, "openrouter.enc"), "utf8");
  const ciphertext = JSON.parse(encrypted);
  ciphertext.tag = randomBytes(16).toString("base64");
  await writeFile(join(directory, "openrouter.enc"), JSON.stringify(ciphertext));
  status = await providerStatus();
  assert.equal(status.providers.openrouter.source, "unreadable");
  assert.equal(status.providers.gateway.source, "app");
  status = await (await call({ action: "remove", provider: "openrouter" })).json();
  assert.equal(status.providers.openrouter.source, "none");
  await rm(join(directory, "gateway.enc"));
  assert.equal((await readProviderKey("gateway")).source, "environment");
  await writeFile(join(directory, "openrouter.enc"), encrypted);
  process.env.EVE_SESSION_SECRET = randomBytes(32).toString("hex");
  await assert.rejects(readProviderKey("openrouter"));
  console.log(
    "PASS: auth, CSRF, bounded input, wrong-provider key detection, encrypted storage, activation on save, cross-process runtime view, instant switching, per-provider connection tests, no key leakage, tamper/secret-rotation fail-closed and removal",
  );
} finally {
  globalThis.fetch = originalFetch;
  await rm(directory, { recursive: true, force: true });
}
