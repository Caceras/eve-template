// Verifies a deployed release from the outside, as production-release.md's
// runbook describes: healthy runtime with the expected release, private APIs
// closed to anonymous callers, and installable-app files served.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const release = readFileSync(resolve(root, "app/api/health/route.ts"), "utf8").match(
  /const RELEASE = "([^"]+)"/,
)?.[1];
assert(release, "RELEASE constant not found in app/api/health/route.ts");
const origins = (process.env.LIVE_ORIGINS || "https://aegentica.se,https://ai-chat.se").split(",");
const get = (url) => fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15_000) });

for (const origin of origins) {
  const health = await (await get(`${origin}/api/health`)).json();
  assert.equal(health.ok, true, `${origin} health: ${JSON.stringify(health)}`);
  assert.equal(health.release, release, `${origin} serves ${health.release}, expected ${release}`);
  for (const path of ["/api/chats", "/api/agents", "/api/images", "/api/settings/providers"])
    assert.equal((await get(origin + path)).status, 401, `${origin}${path} must require sign-in`);
  for (const path of ["/", "/sw.js", "/manifest.webmanifest", "/icons/icon-192.png"])
    assert.equal((await get(origin + path)).status, 200, `${origin}${path}`);
  console.log(`PASS: ${origin} serves ${release}, private APIs closed, app files served`);
}
