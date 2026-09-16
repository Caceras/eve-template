import { defineEval, type EveEvalTargetHandle } from "eve/evals";

interface CreateSessionResponse {
  readonly ok: true;
  readonly sessionId: string;
  readonly status: "accepted";
}

export default defineEval({
  description: "A message-free session initializes before turn zero and accepts its first message.",
  async test(t) {
    const created = await createSession(t.target);
    const initialized = await t.target.watchTurn(created.sessionId).result();

    initialized.event("session.started", { count: 1 });
    initialized.event("session.waiting", { count: 1 });
    initialized.notEvent("turn.started");
    initialized.notEvent("message.received");
    initialized.notEvent("step.started");

    const message = `Alice opened this chat while the session warmed up. Greet her briefly and include reference ${crypto.randomUUID()}.`;
    const firstTurn = t.target.watchTurn(created.sessionId, {
      startIndex: initialized.events.length,
    });
    await continueSession(t.target, created.sessionId, message);
    const result = await firstTurn.result();

    result.expectOk();
    result.notEvent("session.started");
    result.event("turn.started", { count: 1, data: { turnId: "turn_0" } });
    result.event("message.received", { count: 1, data: { message, turnId: "turn_0" } });
    result.event("step.started", { count: 1, data: { turnId: "turn_0" } });
  },
});

async function createSession(target: EveEvalTargetHandle): Promise<CreateSessionResponse> {
  const response = await target.fetch("/eve/v1/session", {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`POST /eve/v1/session failed (${response.status}): ${text}`);
  return JSON.parse(text) as CreateSessionResponse;
}

async function continueSession(
  target: EveEvalTargetHandle,
  sessionId: string,
  message: string,
): Promise<void> {
  const response = await target.fetch(`/eve/v1/session/${encodeURIComponent(sessionId)}`, {
    body: JSON.stringify({ message }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`POST continuation failed (${response.status}): ${await response.text()}`);
  }
}
