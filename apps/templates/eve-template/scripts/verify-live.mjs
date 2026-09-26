// Verifies a deployed release from the outside, as production-release.md's
// runbook describes: healthy app and eve runtime with server-side chat storage
// and the expected release, private APIs closed to anonymous callers (and no
// setup details in the signed-out bootstrap), eve's
// internal workflow queue not reachable, and installable-app files served.
// `LIVE_ORIGINS` (comma-separated) replaces the default production domains.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const release = readFileSync(resolve(root, "lib/release.ts"), "utf8").match(
  /export const RELEASE = "([^"]+)"/,
)?.[1];
assert(release, "RELEASE constant not found in lib/release.ts");

const defaultOrigins = ["https://aegentica.se", "https://www.aegentica.se", "https://ai-chat.se"];
const origins = (process.env.LIVE_ORIGINS?.trim() ? process.env.LIVE_ORIGINS.split(",") : [])
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
if (origins.length === 0) origins.push(...defaultOrigins);

// Every static route under app/api/settings, so a new settings API is covered
// without editing this list.
const settingsDirectory = resolve(root, "app/api/settings");
const settingsRoutes = readdirSync(settingsDirectory, { recursive: true })
  .map(String)
  .filter((file) => file === "route.ts" || file.endsWith(`${sep}route.ts`))
  .map((file) =>
    relative(root, resolve(settingsDirectory, dirname(file)))
      .split(sep)
      .join("/"),
  )
  .filter((path) => !path.includes("["))
  .map((path) => `/${path.replace(/^app\//, "")}`)
  .sort();
assert(settingsRoutes.length > 0, "no routes found under app/api/settings");
const privateRoutes = ["/api/chats", "/api/agents", "/api/images", ...settingsRoutes];

const request = (url, init = {}) =>
  fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000), ...init });

for (const origin of origins) {
  const healthResponse = await request(`${origin}/api/health`);
  const health = await healthResponse.json().catch(() => null);
  const summary = `${origin}/api/health (HTTP ${healthResponse.status}): ${JSON.stringify(health)}`;
  assert.equal(health?.ok, true, summary);
  assert.equal(health.app, "ready", summary);
  assert.equal(health.eve, "ready", summary);
  assert.equal(health.storage, "database", `${summary}: chats must be stored on the server`);
  assert.equal(health.release, release, `${origin} serves ${health.release}, expected ${release}`);

  for (const path of privateRoutes)
    assert.equal(
      (await request(origin + path)).status,
      401,
      `${origin}${path} must require sign-in`,
    );

  // Signed out, bootstrap says only whether and how to sign in.
  const bootstrap = await (await request(`${origin}/api/bootstrap`)).json();
  assert.deepEqual(
    Object.keys(bootstrap.setupStatus).sort(),
    ["appReady", "authMode", "authReady"],
    `${origin}/api/bootstrap must not describe the setup to anonymous callers`,
  );

  // eve's workflow queue accepts runs without sign-in, so the app must not expose
  // it. The probe has no queue headers, so even an exposed queue would reject it
  // (400) instead of starting a run.
  const queue = await request(`${origin}/.well-known/workflow/v1/flow`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(queue.status, 404, `${origin}/.well-known/workflow/v1/flow must not be public`);

  for (const path of ["/", "/sw.js", "/manifest.webmanifest", "/icons/icon-192.png"])
    assert.equal((await request(origin + path)).status, 200, `${origin}${path}`);

  const home = (await request(`${origin}/`)).headers;
  assert.match(home.get("content-security-policy") ?? "", /frame-ancestors 'self'/, origin);
  assert.match(home.get("content-security-policy") ?? "", /img-src 'self' data: blob:/, origin);
  assert.equal(home.get("x-content-type-options"), "nosniff", origin);
  assert.match(home.get("strict-transport-security") ?? "", /max-age=/, origin);

  console.log(
    `PASS: ${origin} serves ${release} (app and eve ready), ${privateRoutes.length} private APIs closed, workflow queue internal, app files served, security headers set`,
  );
}
