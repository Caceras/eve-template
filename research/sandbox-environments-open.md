---
issue: TBD
status: draft
last_updated: "2026-09-15"
---

# Sandbox environments and provider sessions

## Decision

Authors configure an immutable provider environment, then open its sandbox for the current eve session:

```ts
export const environment = VercelSandbox.environment({
  prepare: async (sandbox) => {
    await sandbox.run({ command: "pnpm install --frozen-lockfile" });
  },
});

export default defineSandbox(() =>
  environment.open({
    networkPolicy: "deny-all",
    onSession: async ({ sandbox, session }) => {
      await sandbox.writeTextFile({ path: ".eve/session", content: session.id });
    },
  }),
);
```

`environment.open()` returns the exact `RuntimeSandboxSession` selected by the sandbox definition. It is the only author-facing environment operation.

## Provider-owned options and hooks

Environment configuration and live options are single provider-owned objects. Core passes them unchanged and never reserves, injects, extracts, or interprets fields such as `prepare` or `onSession`.

Omission remains `undefined`. Providers normalize optional input themselves. Objects with required fields remain required; positional arguments are not supported.

Providers own callback names, argument types, ordering, and lifecycle timing. A snapshot provider may expose `prepare(sandbox)`. A provider may expose an `onSession` callback in its open options and construct that callback's arguments from the live sandbox, current artifact, and read-only eve session context. Dockerfile image providers expose no authored preparation callback when immutable setup belongs in the Dockerfile.

Provider callbacks and runtime callback arguments are never stored in prepared artifacts. Provider-defined session-hook return values may enter serialized provider session state only when `resume()` needs them.

## Public sandbox sessions

`SandboxSession` is an I/O-only surface used by preparation and provider-defined session hooks. It contains process and file operations, eve-owned `resolvePath()`, and optional `setNetworkPolicy()`. It has no `id`, `stop()`, or `delete()`.

`RuntimeSandboxSession` extends that surface with `stop()` and `delete()` and is returned by `environment.open()`.

Authors use `ctx.session.id` for durable eve identity. Provider-native IDs and core artifact keys remain private. `resolvePath()` remains unchanged: relative paths resolve beneath `/workspace`, and absolute paths pass through.

`setNetworkPolicy()` is an optional capability. Dedicated Vercel, Docker, and microsandbox providers expose it. A provider that reuses one native network boundary may omit it and require immutable policy in environment configuration.

## Provider contract

```ts
interface SandboxProviderImplementation<OpenOptions, Artifact, SessionState> {
  prepare(context: SandboxProviderPrepareContext): Promise<Artifact>;

  start(
    context: SandboxProviderSessionContext,
    options: Readonly<OpenOptions> | undefined,
    artifact: Readonly<Artifact>,
  ): Promise<{
    handle: SandboxProviderHandle;
    state: SessionState;
  }>;

  resume(
    context: SandboxProviderSessionContext,
    options: Readonly<OpenOptions> | undefined,
    artifact: Readonly<Artifact>,
    state: Readonly<SessionState>,
  ): Promise<SandboxProviderHandle>;
}

interface SandboxProviderSessionContext {
  readonly session: SandboxSelectorContext["session"];
  readonly storagePath: string;
}

interface SandboxProviderHandle {
  readonly sandbox: SandboxSession;
  onSessionStop(): Promise<void>;
  onRuntimeShutdown(): Promise<void>;
  onSessionDelete(options?: SandboxDeleteOptions): Promise<void>;
}
```

`Artifact` and `SessionState` are JSON-compatible provider-owned types. Core erases exact types only at the heterogeneous runtime registry boundary.

### Preparation

`prepare()` is mandatory and returns only the complete artifact. A provider with no build work may return `null`. Cache reuse is provider logging, not shared return data.

Managed workspace and skills are available only during preparation. The artifact captures their files or exact provider references. Runtime never rebuilds, rehydrates, repairs, or reinterprets build inputs.

Core keeps its artifact storage key private and passes the artifact directly to `start()` and `resume()`. There is no `base | prepared` source union.

### Provider-discovered files

Preparation context exposes a tracked filesystem scoped to the authored sandbox directory:

```ts
interface SandboxProviderFiles {
  glob(pattern: string): Promise<readonly string[]>;
  read(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
}
```

Providers discover their own Dockerfiles and build contexts through this surface. Core tracks, hashes, and watches reads. Providers do not receive the application root for authored file discovery.

Provider contexts expose `storagePath` for private caches, local VM state, and temporary files. Core owns project layout.

### Start and resume

Core calls `start()` when no serialized provider session state exists and `resume()` whenever it does. `start()` is idempotent: repeated or concurrent calls with the same context, options, and artifact converge on the same native resource and equivalent state. `resume()` may run repeatedly across process restarts.

`start()` receives the current provider-owned open options and exact artifact. `resume()` receives the same options, the target deployment's exact artifact, and persisted provider state. Providers validate artifacts during both methods.

Provider, environment configuration, open options, artifact selection, and provider state are pinned to the durable sandbox session generation. They do not rotate implicitly. Deletion or explicit migration clears or replaces state.

During deployment handoff, the target provider validates state against its current implementation and artifact. Incompatibility rejects activation, leaving the existing owner on its current deployment. Core does not persist old artifacts or migrate provider state.

### Minimal session state

Provider session state contains only values that cannot be cheaply and deterministically recovered, such as an opaque platform ID. It does not duplicate prepared artifacts, options, credentials, clients, callbacks, or derivable hashes. Providers version and validate their state in `resume()`.

There is no post-open `captureMetadata()` and no create/restore context union.

### Lifecycle hooks

Provider-handle hooks describe the eve event, not a required native effect:

- `onSessionStop()` handles authored `sandbox.stop()` while preserving provider session state.
- `onRuntimeShutdown()` releases a process-local attachment without changing durable state.
- `onSessionDelete()` handles authored deletion; core clears provider state after it succeeds.

Dedicated providers normally map these hooks to native stop or delete. Providers that reuse native resources map them to logical detachment. Core has no native ownership flag or provider-owned lifetime branch.

## Native identity

Core does not derive provider instance keys or native names. Each provider derives identity from the inputs it owns.

Dedicated providers include `session.id`:

```text
session ID
+ validated artifact
+ immutable environment options
+ open options
+ provider contract version
→ native identity
```

A reused provider excludes the eve session ID:

```text
validated artifact
+ immutable environment options
+ provider contract version
→ reused native identity
```

Identity derivation excludes credentials, signals, clients, callbacks, logs, and mutable turn data. Providers canonicalize supported values and reject unsupported non-serializable identity inputs.

Core does not expose a universal generation or revalidation field. It does not pass its internal artifact key to providers. Compatibility is the provider-derived identity; no `sandboxConfig` or second provider manifest is added.

## Dedicated Vercel behavior

The Vercel provider retains the useful pre-redesign behavior inside its own implementation:

1. `start()` derives a deterministic native name from `session.id`, the validated artifact, environment options, open options, and a Vercel contract version.
2. It looks up that name and creates only when absent.
3. When it creates native compute, it runs its provider-owned `onSession` hook.
4. It returns minimal state such as `{ version: 1, sandboxName }`.
5. `resume()` reconnects from that state.
6. If native compute is missing during resume, it recreates from the exact artifact and runs `onSession` for the newly created Sandbox.

Snapshot-unavailable replacement behavior remains provider-owned. No author controls the native name.

## Reused providers

Cross-session native reuse is not a core feature. A custom provider may derive native identity without `session.id` while returning one session-owned logical view per eve session.

The experimental reused Vercel provider uses the same prepared image and Drive mechanics but has a distinct provider contract. It exposes immutable shared network policy and no mutable `setNetworkPolicy()`. Its lifecycle hooks do not tear down native compute used by other sessions.

Concurrent creation, initialization recovery, attachment accounting, active-handle deduplication, and garbage collection remain provider implementation details. Core tracks one logical handle per eve session.

## Default selection

`defineSandboxProvider()` has one implementation contract and no `select` escape hatch. `DefaultSandbox` is an explicit facade that probes the host and returns a concrete Vercel, Docker, microsandbox, or just-bash environment. Every concrete provider uses `defineSandboxProvider()`.

Core exposes no public environment `kind`. Providers discover their own preparation inputs through the tracked filesystem.

## Observable invariants

- Authors use only `environment.open(options)`.
- Environment and open options are provider-owned single objects; omission remains `undefined`.
- Core invokes provider `prepare()`, `start()`, and `resume()` directly.
- Prepared artifacts are immutable, complete, and consumed directly at runtime.
- Provider start is idempotent; resume may repeat across process restarts.
- Provider session state is minimal, JSON-compatible, and provider-validated.
- Existing sessions retain their pinned generation across deployment handoff or remain on the old deployment when incompatible.
- Core contains no provider-native identity, sharing, ownership, or repair branch.
- Public sandbox sessions expose operations rather than provider or core identity.
