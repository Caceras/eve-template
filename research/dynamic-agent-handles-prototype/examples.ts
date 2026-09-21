import { defineTool } from "../../packages/eve/src/tools/definition.ts";
import { prototypeContext, validateDestination, type AgentContext } from "./prototype.ts";

/** The application supplies this URL; neither the model nor catalog entries choose it. */
export async function loadExternalAgents(ctx: AgentContext, directoryURL: string) {
  const response = await fetch(directoryURL, {
    signal: AbortSignal.timeout(2_000),
    redirect: "error",
  });
  if (!response.ok || !response.body) throw new Error("Agent directory unavailable.");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65_536) throw new Error("Agent directory exceeds 64 KiB.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const values: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!Array.isArray(values) || values.length > 64) throw new Error("Invalid agent directory.");
  const destinations = values.map(validateDestination);
  return destinations.map((destination) => ctx.registerAgent(destination));
}

export function discoveryTool(directoryURL: string) {
  return defineTool({
    description: "Load agents from the configured directory into this session.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    async execute(_input, baseCtx) {
      const ctx = prototypeContext(baseCtx);
      const handles = await loadExternalAgents(ctx, directoryURL);
      // The return value contains no handles; registration controls advertisement.
      return { loaded: handles.length };
    },
  });
}

export const registerAndCallTool = defineTool({
  description: "Register a reviewer and immediately ask it to review the change.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async execute(_input, baseCtx) {
    const ctx = prototypeContext(baseCtx);
    const handle = ctx.registerAgent({
      key: "change-reviewer",
      description: "Reviews code changes.",
      route: "reviewer",
    });
    return ctx.agent(handle, { message: "Review the new handle registration contract." });
  },
});

export const updateDescriptionTool = defineTool({
  description: "Update an advertised agent's description.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string" }, description: { type: "string" } },
    required: ["id", "description"],
    additionalProperties: false,
  },
  execute(input, baseCtx) {
    if (typeof input.id !== "string" || typeof input.description !== "string") {
      throw new Error("Expected an agent handle ID and description.");
    }
    prototypeContext(baseCtx).updateAgent({ id: input.id }, input.description);
    return { updated: true };
  },
});
