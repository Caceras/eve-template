import { describe, expect, it } from "vitest";

import { emitTerminalSessionEvent } from "#execution/terminal-session-event.js";
import { createSessionFailedEvent } from "#protocol/message.js";

describe("emitTerminalSessionEvent", () => {
  it("closes the durable stream after emitting a terminal failure", async () => {
    let closed = false;
    const parentWritable = new WritableStream<Uint8Array>({
      close() {
        closed = true;
      },
    });

    await emitTerminalSessionEvent({
      event: createSessionFailedEvent({
        code: "WORKFLOW_EXECUTION_FAILED",
        message: "failed",
        sessionId: "session_xyz",
      }),
      parentWritable,
      serializedContext: { "eve.sessionId": "session_xyz" },
    });

    expect(closed).toBe(true);
  });
});
