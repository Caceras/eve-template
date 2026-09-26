import { defineDynamic, defineTool } from "eve/tools";
import { always } from "eve/tools/approval";
import { z } from "zod";
import { examplesEnabled } from "../lib/examples";

// Reference example of human approval; off in production (agent/lib/examples.ts).
export default defineDynamic({
  events: {
    "session.started": () =>
      examplesEnabled
        ? defineTool({
            description:
              "A harmless reference tool whose only purpose is to demonstrate eve's durable human approval flow.",
            inputSchema: z.object({
              message: z.string().min(1).max(500),
            }),
            approval: always(),
            async execute({ message }) {
              return { approved: true, message };
            },
          })
        : null,
  },
});
