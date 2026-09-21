import { ensureSandboxAccess, type EnsureSandboxAccessInput } from "#execution/sandbox/ensure.js";
import type { HarnessSession } from "#harness/types.js";
import type { SandboxAccess, SandboxState } from "#sandbox/state.js";
import { type ChannelAdapter, getAdapterKind } from "#channel/adapter.js";
import { contextStorage } from "#context/container.js";
import { SandboxKey, SessionIdKey } from "#context/keys.js";
import {
  BundleKey,
  ChannelKey,
  type CompiledBundle,
} from "#runtime/sessions/runtime-context-keys.js";
import { getActiveRuntimeNode } from "#context/node.js";
import type { ContextReader, FrameworkContextProvider } from "#context/provider.js";

export const sandboxProvider: FrameworkContextProvider<SandboxAccess> = {
  key: SandboxKey,

  async create(ctx, session) {
    const input = resolveSandboxAccessInput(ctx, session);
    if (input === undefined) return undefined;
    return {
      value: await ensureSandboxAccess({
        ...input,
        runOnSession: async (callback) => await contextStorage.run(ctx, callback),
      }),
    };
  },

  async commit(access, session) {
    const state = await access.captureState();
    return { ...session, sandboxState: state };
  },
};

export function resolveSandboxAccessInput(
  ctx: ContextReader,
  session: HarnessSession,
): EnsureSandboxAccessInput | undefined {
  const bundle = ctx.get(BundleKey);
  if (bundle === undefined) return undefined;
  const node = getActiveRuntimeNode(ctx);
  const registry = node.sandboxRegistry;
  const sessionId = ctx.require(SessionIdKey);
  const channel = ctx.get(ChannelKey);
  const adapterState = channel?.state as Record<string, unknown> | undefined;
  const parentSandboxState = adapterState?.parentSandboxState as SandboxState | undefined;
  const inheritsParent = registry.sandbox?.definition.inheritsParent === true;
  const sharedSandboxSessionId = adapterState?.sandboxSessionId as string | undefined;
  const sharesSandbox = inheritsParent || sharedSandboxSessionId !== undefined;
  const sandboxSessionId = sharesSandbox ? (sharedSandboxSessionId ?? sessionId) : sessionId;
  return {
    compiledArtifactsSource: bundle.compiledArtifactsSource,
    nodeId: node.nodeId,
    ownsSandbox: !sharesSandbox,
    registry,
    sessionId: sandboxSessionId,
    state: session.sandboxState ?? (sharesSandbox ? parentSandboxState : undefined) ?? null,
    tags: {
      agent: resolveTagAgentName({ bundle, node }),
      channel: resolveTagChannelKind(channel),
      sessionId,
    },
  };
}

function resolveTagAgentName(input: {
  readonly bundle: CompiledBundle;
  readonly node: ReturnType<typeof getActiveRuntimeNode>;
}): string {
  const partialNode = input.node as {
    readonly agent?: { readonly config?: { readonly name?: string } };
    readonly nodeId?: string;
  };
  const partialBundle = input.bundle as {
    readonly resolvedAgent?: { readonly config?: { readonly name?: string } };
  };

  return (
    partialNode.agent?.config?.name ??
    partialBundle.resolvedAgent?.config?.name ??
    partialNode.nodeId ??
    "unknown"
  );
}

function resolveTagChannelKind(channel: ChannelAdapter | undefined): string {
  return channel === undefined ? "unknown" : getAdapterKind(channel);
}
