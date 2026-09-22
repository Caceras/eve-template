// Exercises a running app (CHECK_ORIGIN) end to end: for each provider with a
// saved key, switch to it, send one message and confirm the runtime used the
// requested model. With real keys this sends real, token-consuming requests.
import assert from "node:assert/strict";
import { Client } from "eve/client";
const host = process.env.CHECK_ORIGIN || "http://127.0.0.1:3000";
const login = await fetch(host + "/api/password-auth/login", {
  method: "POST",
  headers: { Origin: host, "Content-Type": "application/json" },
  body: JSON.stringify({
    username: process.env.EVE_CHAT_USERNAME,
    password: process.env.EVE_CHAT_PASSWORD,
  }),
});
assert.equal(login.status, 200, "Sign-in failed; set EVE_CHAT_USERNAME and EVE_CHAT_PASSWORD.");
const cookie = login.headers
  .getSetCookie()
  .map((s) => s.split(";", 1)[0])
  .join("; ");
const settings = (body) =>
  fetch(host + "/api/settings/providers", {
    method: body ? "POST" : "GET",
    headers: { Cookie: cookie, Origin: host, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  }).then((r) => r.json());
const client = new Client({ host, headers: { Cookie: cookie } });
const { providers } = await settings();
const model = process.env.CHECK_MODEL || "anthropic/claude-sonnet-5";
for (const provider of Object.keys(providers).filter((p) => providers[p].configured)) {
  assert.equal((await settings({ action: "activate", provider })).active, provider);
  const { response } = await client.sessions.create({
    message: "Reply with OK.",
    headers: { "x-aegentica-model": model },
    signal: AbortSignal.timeout(60_000),
  });
  const result = await response.result();
  const steps = result.events.filter((e) => e.type === "step.started");
  const failure = result.events.find((e) => e.type === "session.failed")?.data;
  console.log(
    JSON.stringify({
      provider,
      status: result.status,
      steps: steps.map((e) => e.data.modelId),
      failure,
    }),
  );
  assert(
    steps.some((e) => String(e.data.modelId).includes(model)),
    `${provider}: the selected model did not reach the runtime`,
  );
}
