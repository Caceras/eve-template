import { defineWorkflowTool, type WorkflowStepToolContext } from "#public/tools/index.js";

export const blocking = defineWorkflowTool({
  description: "Return session identity without requiring a sandbox.",
  inputSchema: { type: "object", properties: {} },
  async execute(_input, ctx) {
    "use workflow";
    return await readSession(ctx);
  },
});

const background = defineWorkflowTool({
  description: "Return session identity in the background without a sandbox.",
  execution: "background",
  inputSchema: { type: "object", properties: {} },
  async execute(_input, ctx) {
    "use workflow";
    return await readSession(ctx);
  },
});

async function readSession(ctx: WorkflowStepToolContext) {
  "use step";
  return { sessionId: ctx.session.id };
}

void background;
