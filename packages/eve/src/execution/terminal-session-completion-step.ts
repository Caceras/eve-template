import { emitSessionBoundaryEvent } from "#execution/session-boundary-event.js";
import type { DurableSessionState } from "#execution/durable-session-store.js";
import { createSessionCompletedEvent } from "#protocol/message.js";

/** Emits a terminal `session.completed` outside a turn. */
export async function emitTerminalSessionCompletionStep(input: {
  readonly parentWritable: WritableStream<Uint8Array>;
  readonly serializedContext: Record<string, unknown>;
  readonly sessionState?: DurableSessionState;
}): Promise<void> {
  "use step";

  await emitSessionBoundaryEvent({ ...input, event: createSessionCompletedEvent() });
}
