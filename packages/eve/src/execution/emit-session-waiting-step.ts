import { emitSessionBoundaryEvent } from "#execution/session-boundary-event.js";
import type { DurableSessionState } from "#execution/durable-session-store.js";
import { createSessionWaitingEvent } from "#protocol/message.js";

/** Emits the parked session boundary after the driver confirms more work remains. */
export async function emitSessionWaitingStep(input: {
  readonly parentWritable: WritableStream<Uint8Array>;
  readonly serializedContext: Record<string, unknown>;
  readonly sessionState: DurableSessionState;
}): Promise<void> {
  "use step";

  await emitSessionBoundaryEvent({ ...input, event: createSessionWaitingEvent() });
}
