import { randomUUID } from "node:crypto";
import type { ToolContext } from "../../packages/eve/src/tools/definition.ts";
import { resolveAgentsAnnouncement } from "../../packages/eve/src/subagents/handles/prompt.ts";

type ModelMessage = Parameters<typeof resolveAgentsAnnouncement>[0]["messages"][number];

export interface Destination {
  key: string;
  description: string;
  route: string;
  sessionId?: string;
}

export interface Handle {
  id: string;
}

interface Entry {
  handle: Handle;
  destination: Destination;
  sessionId?: string;
  status: string;
}

export interface AgentContext {
  registerAgent(destination: Destination): Handle;
  updateAgent(handle: Handle, description: string): void;
  unregisterAgent(handle: Handle): void;
  agent(handle: Handle, input: { message: string }): Promise<string>;
}

export type Dispatch = (input: {
  destination: Destination;
  sessionId?: string;
  message: string;
}) => Promise<{ sessionId: string; output: string }>;

const contexts = new WeakMap<object, AgentContext>();

/** Research-only bridge; eve's ordinary ToolContext does not yet expose these methods. */
export function prototypeContext(ctx: ToolContext): AgentContext {
  const context = contexts.get(ctx);
  if (!context) throw new Error("This example requires the prototype runner.");
  return context;
}

export class InvocationError extends Error {
  readonly code: "unavailable" | "denied" | "expired-session" | "acceptance-unknown" | "busy";

  constructor(code: InvocationError["code"]) {
    super(code);
    this.code = code;
  }
}

export function validateDestination(value: unknown): Destination {
  if (typeof value !== "object" || value === null) throw new Error("Invalid destination.");
  const item = value as Record<string, unknown>;
  for (const key of ["key", "description", "route"]) {
    if (typeof item[key] !== "string" || item[key].length === 0 || item[key].length > 512) {
      throw new Error(`Invalid destination ${key}.`);
    }
  }
  if (
    item.sessionId !== undefined &&
    (typeof item.sessionId !== "string" || !item.sessionId || item.sessionId.length > 512)
  ) {
    throw new Error("Invalid session binding.");
  }
  const destination: Destination = {
    key: item.key as string,
    description: item.description as string,
    route: item.route as string,
  };
  if (item.sessionId !== undefined) destination.sessionId = item.sessionId as string;
  return destination;
}

/** Single-process contract experiment, not a durable eve session implementation. */
export class PrototypeSession {
  #entries: Entry[] = [];
  #busy = new Set<string>();
  #pendingTools = 0;
  #messages: ModelMessage[] = [];
  #dispatch: Dispatch;
  #authorize: (destination: Destination) => boolean;

  readonly context: AgentContext = {
    registerAgent: (value) => {
      const destination = validateDestination(value);
      const existing = this.#entries.find((entry) => entry.destination.key === destination.key);
      if (existing) {
        if (JSON.stringify(existing.destination) !== JSON.stringify(destination)) {
          throw new Error("Destination already registered; use updateAgent for its description.");
        }
        return { ...existing.handle };
      }
      if (this.#entries.length >= 64) throw new Error("Prototype registry limit reached.");
      const handle = { id: `ag_${randomUUID()}` };
      this.#entries.push({
        handle,
        destination,
        sessionId: destination.sessionId,
        status: "unknown",
      });
      return { ...handle };
    },
    updateAgent: (handle, description) => {
      const entry = this.#resolve(handle);
      entry.destination = validateDestination({ ...entry.destination, description });
    },
    unregisterAgent: (handle) => {
      this.#resolve(handle);
      this.#entries = this.#entries.filter((entry) => entry.handle.id !== handle.id);
    },
    agent: async (handle, input) => {
      const entry = this.#resolve(handle);
      if (!this.#authorize(structuredClone(entry.destination))) {
        entry.status = "denied";
        throw new InvocationError("denied");
      }
      if (this.#busy.has(handle.id)) throw new InvocationError("busy");
      this.#busy.add(handle.id);
      try {
        const result = await this.#dispatch({
          destination: structuredClone(entry.destination),
          sessionId: entry.sessionId,
          message: input.message,
        });
        entry.sessionId = result.sessionId;
        entry.status = "available";
        return result.output;
      } catch (error) {
        entry.status = error instanceof InvocationError ? error.code : "acceptance-unknown";
        throw error;
      } finally {
        this.#busy.delete(handle.id);
      }
    },
  };

  constructor(options: {
    dispatch: Dispatch;
    authorize: (destination: Destination) => boolean;
    staticAgents?: Destination[];
  }) {
    this.#dispatch = options.dispatch;
    this.#authorize = options.authorize;
    for (const destination of options.staticAgents ?? []) this.context.registerAgent(destination);
  }

  #resolve(handle: Handle): Entry {
    const entry = this.#entries.find((item) => item.handle.id === handle.id);
    if (!entry) throw new Error("Unknown or removed agent handle.");
    return entry;
  }

  handle(key: string): Handle {
    const entry = this.#entries.find((item) => item.destination.key === key);
    if (!entry) throw new Error("Unknown destination.");
    return { ...entry.handle };
  }

  async runTool<Input, Output>(
    tool: {
      execute: (input: Input, ctx: ToolContext) => Output | Promise<Output>;
    },
    input: Input,
  ): Promise<Output> {
    if (this.#pendingTools) throw new Error("The prototype runs tools serially.");
    const callId = randomUUID();
    // No other eve context services are emulated by this research runner.
    const base = Object.freeze({ callId }) as ToolContext;
    contexts.set(base, this.context);
    this.#pendingTools++;
    this.#messages.push({
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: callId,
          toolName: "prototype_tool",
          input,
        },
      ],
    });
    try {
      const output = await tool.execute(input, base);
      this.#result(callId, JSON.stringify(output) ?? "null");
      return output;
    } catch (error) {
      this.#result(callId, "Tool failed.");
      throw error;
    } finally {
      contexts.delete(base);
      this.#pendingTools--;
    }
  }

  #result(callId: string, text: string): void {
    this.#messages.push({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: callId,
          toolName: "prototype_tool",
          output: { type: "text", value: text },
        },
      ],
    });
  }

  captureRequest(): readonly ModelMessage[] {
    if (this.#pendingTools) throw new Error("Tool results must be recorded before publication.");
    const announcement = resolveAgentsAnnouncement({
      store: undefined,
      messages: this.#messages,
      agentViews: this.#entries.map((entry) => ({
        id: entry.handle.id,
        name: entry.destination.key,
        availability: this.#busy.has(entry.handle.id) ? "busy" : "available",
        statusLine: `${entry.destination.description} (${entry.status})`,
      })),
    });
    if (announcement !== undefined) this.#messages.push({ role: "user", content: announcement });
    return structuredClone(this.#messages);
  }

  compactHistory(): void {
    if (this.#pendingTools) throw new Error("Cannot compact pending tools.");
    this.#messages = [];
  }

  snapshot(): string {
    if (this.#pendingTools || this.#busy.size) throw new Error("Cannot snapshot active work.");
    return JSON.stringify(this.#entries);
  }

  /** Only accepts trusted snapshots produced by this prototype, not external registry input. */
  restore(snapshot: string): void {
    if (this.#entries.length || this.#pendingTools || this.#busy.size) {
      throw new Error("Restore requires an empty, idle session.");
    }
    this.#entries = JSON.parse(snapshot) as Entry[];
  }
}
