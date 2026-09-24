import { defineTool } from "eve/tools";
import { z } from "zod";
import { demoSessionState } from "../lib/session-state";

export default defineTool({
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
});
