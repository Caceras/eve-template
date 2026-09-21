import { isPrivateOrReservedIpAddress } from "#shared/network-address.js";
import { createHash } from "node:crypto";
import type { ContextReader } from "#context/key.js";
import { AgentRegistryKey } from "#context/agent-registry-key.js";
import type { FrameworkContextProvider } from "#context/provider.js";
import type { HarnessSession } from "#harness/types.js";
import { ParentSessionKey } from "#context/keys.js";
import { ROOT_RUNTIME_AGENT_NODE_ID } from "#runtime/graph.js";
import { BundleKey } from "#runtime/sessions/runtime-context-keys.js";
import {
  getAgentHandleStore,
  setAgentHandleStore,
  writeHandles,
  type AgentHandle,
} from "#subagents/handles/store.js";
import type { AgentDestination, AgentReference } from "#subagents/registration.js";

export { AgentRegistryKey } from "#context/agent-registry-key.js";

/** The step's working view of the existing durable handle store. */
export class AgentRegistry {
  #session: HarnessSession;
  #changed = false;
  readonly #ctx: ContextReader;

  constructor(ctx: ContextReader, session: HarnessSession) {
    this.#ctx = ctx;
    this.#session = session;
  }

  get handles(): readonly AgentHandle[] {
    return getAgentHandleStore(this.#session.state)?.handles ?? [];
  }

  replace(handles: readonly AgentHandle[]): void {
    this.#session = writeHandles(this.#session, handles);
    this.#changed = true;
  }

  commit(session: HarnessSession): HarnessSession {
    if (!this.#changed) return session;
    return {
      ...session,
      state: setAgentHandleStore(session.state, getAgentHandleStore(this.#session.state)!),
    };
  }

  initialize(): void {
    if (getAgentHandleStore(this.#session.state)?.registrationsInitialized) return;
    for (const [name, entry] of this.#ctx.get(BundleKey)?.subagentRegistry.subagentsByName ?? []) {
      this.register({
        key: name,
        description: entry.definition.description ?? name,
        target: { kind: "agent", name },
      });
    }
    this.#session = {
      ...this.#session,
      state: setAgentHandleStore(this.#session.state, {
        ...getAgentHandleStore(this.#session.state),
        handles: this.handles,
        registrationsInitialized: true,
      }),
    };
    this.#changed = true;
  }

  register(destination: AgentDestination): AgentReference {
    const existing = this.handles.find(
      (handle) =>
        handle.identity.registration?.visible &&
        handle.identity.registration.key === destination.key,
    );
    if (existing) {
      const { visible: _visible, ...current } = existing.identity.registration!;
      if (
        current.key !== destination.key ||
        current.description !== destination.description ||
        !sameTarget(current.target, destination.target)
      )
        throw new Error(
          `Agent destination "${destination.key}" is already registered with different content.`,
        );
      return { id: existing.identity.id };
    }
    if (
      this.handles.filter((handle) => handle.identity.registration?.visible === true).length >= 128
    )
      throw new Error("A session can register at most 128 agent destinations.");
    const bundle = this.#ctx.require(BundleKey);
    const target = destination.target;
    const definition =
      target.kind === "agent"
        ? (bundle.subagentRegistry.subagentsByName.get(target.name)?.definition ??
          (target.name === "agent" &&
          bundle.nodeId === undefined &&
          this.#ctx.get(ParentSessionKey) === undefined
            ? { name: "agent", nodeId: ROOT_RUNTIME_AGENT_NODE_ID }
            : undefined))
        : undefined;
    if (target.kind === "agent" && definition === undefined)
      throw new Error(`Agent "${target.name}" is not available to this session.`);
    if (target.kind === "remote") {
      const url = new URL(target.url);
      if (
        url.protocol !== "https:" ||
        isPrivateOrReservedIpAddress(url.hostname) ||
        url.username ||
        url.password ||
        url.hash
      )
        throw new Error(
          "Registered remote agents require an HTTPS URL without credentials or a fragment.",
        );
    }
    const store = getAgentHandleStore(this.#session.state) ?? { handles: [] };
    const sequence = (store.registrationSequence ?? 0) + 1;
    const hash = createHash("sha256")
      .update(`${this.#session.sessionId}:${sequence}:${destination.key}`)
      .digest("hex")
      .slice(0, 16);
    const id = `ag_registered:${hash}`;
    const handle: AgentHandle = {
      phase: "registered",
      identity: {
        id,
        name: definition?.name ?? destination.key,
        nodeId: definition?.nodeId ?? id,
        registration: { ...destination, visible: true },
      },
    };
    this.#session = {
      ...this.#session,
      state: setAgentHandleStore(this.#session.state, {
        ...store,
        handles: [...store.handles, handle],
        registrationSequence: sequence,
      }),
    };
    this.#changed = true;
    return { id };
  }

  update(reference: AgentReference, description: string): void {
    const current = this.resolve(reference.id);
    const registration = current.identity.registration;
    if (!registration) throw new Error("Only registered destinations can be updated.");
    this.replace(
      this.handles.map((handle) =>
        handle.identity.id === current.identity.id
          ? {
              ...handle,
              identity: { ...handle.identity, registration: { ...registration, description } },
            }
          : handle,
      ),
    );
  }

  unregister(reference: AgentReference): void {
    const current = this.resolve(reference.id);
    const registration = current.identity.registration;
    if (!registration) throw new Error("Only registered destinations can be unregistered.");
    this.replace(
      this.handles.flatMap((handle): readonly AgentHandle[] => {
        if (handle.identity.id !== current.identity.id) return [handle];
        if (handle.phase === "registered") return [];
        return [
          {
            ...handle,
            identity: { ...handle.identity, registration: { ...registration, visible: false } },
          },
        ];
      }),
    );
  }

  resolve(id: string): AgentHandle {
    const handle = this.handles.find((entry) => entry.identity.id === id);
    if (!handle || handle.identity.registration?.visible === false)
      throw new Error("Unknown or unregistered agent handle.");
    return handle;
  }
}

export const agentRegistryProvider: FrameworkContextProvider<AgentRegistry> = {
  key: AgentRegistryKey,
  create(ctx, session) {
    const value = new AgentRegistry(ctx, session);
    value.initialize();
    return { value };
  },
  commit(value, session) {
    return value.commit(session);
  },
};

function sameTarget(
  first: AgentDestination["target"],
  second: AgentDestination["target"],
): boolean {
  if (first.kind === "agent") return second.kind === "agent" && first.name === second.name;
  return (
    second.kind === "remote" && first.url === second.url && first.sessionId === second.sessionId
  );
}
