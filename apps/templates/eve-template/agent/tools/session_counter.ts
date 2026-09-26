import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";
import { examplesEnabled } from "../lib/examples";
import { demoSessionState } from "../lib/session-state";

// Reference example of durable session state; off in production (agent/lib/examples.ts).
export default defineDynamic({
  events: {
    "session.started": () =>
      examplesEnabled
        ? defineTool({
            description:
              "Demonstrate eve durable per-session state by incrementing a counter and optionally storing a short session-only note.",
            inputSchema: z.object({
              note: z.string().max(200).optional(),
            }),
            async execute({ note }) {
              demoSessionState.update((current) => ({
                count: current.count + 1,
                notes: note ? [...current.notes, note] : current.notes,
              }));
              return demoSessionState.get();
            },
          })
        : null,
  },
});
