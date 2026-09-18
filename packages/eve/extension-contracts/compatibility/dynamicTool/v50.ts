import { defineDynamic, defineTool } from "#public/tools/index.js";

export default defineDynamic({
  events: {
    "session.started": () => ({
      ready: defineTool({
        description: "Return an ordinary dynamic tool result.",
        inputSchema: { type: "object", properties: {} },
        execute: () => ({ ready: true }),
      }),
    }),
  },
});
