import { defineDynamic, defineTool } from "eve/tools";
import { z } from "zod";

export default defineDynamic({
  events: {
    "session.started": (_event, ctx) => {
      const channel = ctx.channel.kind ?? "unknown";
      return defineTool({
        description:
          "Return a tiny piece of context captured when this session started. Demonstrates a durable dynamic tool without external side effects.",
        inputSchema: z.object({ label: z.string().max(80).optional() }),
        execute: ({ label }) => ({ channel, label: label ?? null }),
      });
    },
  },
});
