import { defineEval, type EveEvalTargetHandle } from "eve/evals";
import { equals } from "eve/evals/expect";
import type { MessageStreamEvent } from "eve/client";

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

    const connection = new AbortController();
    const stream = await t.target.fetch(`/eve/v1/session/${created.sessionId}/stream`, {
      signal: AbortSignal.any([t.signal, connection.signal]),
    });
    if (!stream.ok || stream.body === null) throw new Error("Expected a live session stream.");
    const events = readEvents(stream.body);
    try {
      const preamble = await readBoundary(events);
      await t.require(
        preamble.map((event) => event.meta.id),
        equals(initialized.events.map((event) => event.meta.id)),
      );
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

      const streamed = await readBoundary(events);
      await t.require(
        streamed.map((event) => event.meta.id),
        equals(result.events.map((event) => event.meta.id)),
      );
    } finally {
      connection.abort();
      await events.return(undefined);
    }
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

async function readBoundary(
  events: AsyncGenerator<MessageStreamEvent>,
): Promise<MessageStreamEvent[]> {
  const boundary: MessageStreamEvent[] = [];
  for (let count = 0; count < 1_000; count += 1) {
    const next = await events.next();
    if (next.done) throw new Error("The session stream closed before its next waiting boundary.");
    boundary.push(next.value);
    if (next.value.type === "session.waiting") return boundary;
  }
  throw new Error("Expected a waiting boundary within 1,000 events.");
}

async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<MessageStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return;
      pending += decoder.decode(chunk.value, { stream: true });
      let newline: number;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line.length > 0) yield JSON.parse(line) as MessageStreamEvent;
      }
    }
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
