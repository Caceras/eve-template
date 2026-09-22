import assert from "node:assert/strict";
import { Client } from "eve/client";
const host = process.env.CHECK_ORIGIN || "http://127.0.0.1:3007";
const login = await fetch(host + "/api/password-auth/login", {
  method: "POST",
  headers: { Origin: host, "Content-Type": "application/json" },
  body: JSON.stringify({ username: "Riki", password: "1010" }),
});
assert.equal(login.status, 200);
const cookie = login.headers
  .getSetCookie()
  .map((s) => s.split(";", 1)[0])
  .join("; ");
const client = new Client({ host, headers: { Cookie: cookie } });
for (const model of ["deepseek/deepseek-v3.2", "mistral/ministral-14b"]) {
  const { response } = await client.sessions.create({
    message: "Reply with OK.",
    headers: { "x-aegentica-model": model },
    signal: AbortSignal.timeout(45000),
  });
  const result = await response.result();
  const steps = result.events.filter((e) => e.type === "step.started");
  console.log(
    JSON.stringify({
      requested: model,
      status: result.status,
      steps: steps.map((e) => e.data),
      failure: result.events.find((e) => e.type === "session.failed")?.data.message,
    }),
  );
  assert(
    steps.some((e) => e.data.modelId === model),
    "Selected model did not reach the runtime",
  );
}
