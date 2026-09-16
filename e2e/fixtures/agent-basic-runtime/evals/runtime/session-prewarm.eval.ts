import { defineEval, type EveEvalTargetHandle } from "eve/evals";
import { equals } from "eve/evals/expect";
import type { MessageStreamEvent } from "eve/client";

interface CreateSessionResponse {
  readonly ok: true;
  readonly sessionId: string;
  readonly status: "accepted";
}

export default defineEval({
  description: "A prewarmed workflow initializes only when its first message arrives.",
  async test(t) {
    const created = await createSession(t.target);
    const message = `Alice opened this chat while the session warmed up. Greet her briefly and include reference ${crypto.randomUUID()}.`;
    const firstTurn = t.target.watchTurn(created.sessionId, {
      startIndex: 0,
    });
    await continueSession(t.target, created.sessionId, message);
    const connection = new AbortController();
    const stream = await t.target.fetch(`/eve/v1/session/${created.sessionId}/stream`, {
      signal: AbortSignal.any([t.signal, connection.signal]),
    });
    if (!stream.ok || stream.body === null) throw new Error("Expected a live session stream.");
    const events = readEvents(stream.body);
    try {
      const result = await firstTurn.result();

      result.expectOk();
      result.event("session.started", { count: 1 });
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
  for (let attempt = 0; ; attempt += 1) {
    const response = await target.fetch(`/eve/v1/session/${encodeURIComponent(sessionId)}`, {
      body: JSON.stringify({ message }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    if (response.ok) return;
    const body = (await response.json()) as { code?: string };
    if (response.status !== 409 || body.code !== "session_not_ready" || attempt >= 3) {
      throw new Error(`POST continuation failed (${response.status}): ${JSON.stringify(body)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
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
