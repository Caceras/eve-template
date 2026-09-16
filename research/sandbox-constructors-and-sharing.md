---
issue: TBD
status: draft
last_updated: "2026-09-15"
---

# Sandbox environments and `open()`

## Decision

A sandbox environment exposes one operation:

```ts
interface SandboxEnvironment<OpenOptions> {
  readonly provider: string;
  open(options?: OpenOptions): Promise<RuntimeSandboxSession>;
}
```

`open()` opens the logical sandbox owned by the current eve session. On first
access the provider creates native resources. On later access the provider
reconnects from persisted metadata. The author does not choose a framework
name, scope, or sharing policy.

```ts
import { defineSandbox } from "eve/sandbox";
import { VercelSandbox } from "eve/sandbox/vercel";

export const environment = VercelSandbox.environment();

export default defineSandbox(({ session }) =>
  environment.open({
    networkPolicy: session.auth.current === null ? "deny-all" : { allow: ["api.example.com"] },
    resources: { vcpus: 4 },
  }),
);
```

The selector must return the exact `RuntimeSandboxSession` returned by
`environment.open()`.

## Why one operation

`create()` was misleading because the same call reconnects after a durable
boundary. `getOrCreate({ name })` mixed a provider implementation detail with a
framework-level cross-session ownership contract.

The single operation establishes one core invariant:

```text
eve session
  → one derived logical sandbox identity
  → provider create or restore
  → live RuntimeSandboxSession
```

Cross-session native resource reuse is not a built-in environment feature. It
requires a custom provider that defines its own isolation, attachment,
concurrency, retention, and teardown rules while still returning a
session-owned logical sandbox view.

## Environment and live options

Environment construction declares immutable inputs:

```ts
export const environment = DockerSandbox.image("node:24-bookworm", {
  pullPolicy: "if-not-present",
  prepare: async (sandbox) => {
    await sandbox.run({ command: "corepack enable" });
  },
});
```

`open()` accepts live options for the current session:

```ts
export default defineSandbox(() =>
  environment.open({
    networkPolicy: "deny-all",
  }),
);
```

The environment and live options both participate in the session sandbox
identity. A material change rotates the logical sandbox rather than mutating an
unrelated existing resource.

## Live network policy

Network-capable environments may accept an initial policy in `open()` so the
policy applies when native compute starts:

```ts
const sandbox = await environment.open({
  networkPolicy: "deny-all",
});
```

The returned live session may change its policy later:

```ts
const sandbox = await environment.open({
  networkPolicy: "deny-all",
});

await sandbox.setNetworkPolicy({
  allow: ["api.example.com"],
});

return sandbox;
```

The method remains `setNetworkPolicy()`, not `updateNetworkPolicy()`. It is an
eve-owned `RuntimeSandboxSession` operation; providers adapt it to their native
network API. Docker supports coarse allow/deny policy, Vercel and microsandbox
support richer policies, and just-bash does not expose mutable network policy.

Passing the final policy to `open()` is safer when untrusted startup code must
never run with broader access. Calling `setNetworkPolicy()` afterward is useful
when authored setup intentionally starts from a restricted policy and then
opens selected destinations.

## Provider contract

Built-in and custom providers use one lifecycle method:

```ts
interface SandboxProviderImplementation<OpenOptions, Metadata, Artifact> {
  prepare(context: SandboxProviderPrepareContext): Promise<{
    artifact: Artifact;
    reused: boolean;
  }>;

  open(
    context: SandboxProviderOpenContext<OpenOptions, Metadata>,
    source: SandboxProviderSource<Artifact>,
  ): Promise<SandboxProviderHandle<Metadata>>;
}
```

The open context separates provider restoration from prepared source:

```ts
type SandboxProviderInstance<Metadata> =
  | {
      kind: "create";
      name: string;
    }
  | {
      kind: "restore";
      name: string;
      metadata: Readonly<Metadata>;
    };

type SandboxProviderSource<Artifact> =
  | { kind: "base" }
  | {
      kind: "prepared";
      templateName: string;
      artifact: Artifact;
    };

interface SandboxProviderOpenContext<OpenOptions, Metadata> {
  appRoot: string;
  instance: SandboxProviderInstance<Metadata>;
  options: Readonly<OpenOptions>;
  resources: SandboxProviderResources;
  tags?: SandboxProviderTags;
}
```

`instance` tells the provider whether eve has compatible persisted metadata.
`source` tells the provider whether it must start from an exact prepared
artifact. Neither union carries cross-session ownership.

Every built-in provider opens the name eve derives from the current durable
session, agent node, authenticated principal scope, environment revision, and
live configuration. Providers do not accept an author-controlled native name.

## Custom provider example

```ts
import { defineSandboxProvider } from "eve/sandbox/provider";

interface AcmeEnvironmentOptions {
  readonly image: string;
  readonly region: string;
}

interface AcmeOpenOptions {
  readonly networkPolicy?: "allow-all" | "deny-all";
}

interface AcmeMetadata {
  readonly remoteId: string;
}

type AcmeArtifact = {
  readonly templateId: string;
};

export const AcmeSandbox = defineSandboxProvider<
  AcmeEnvironmentOptions,
  AcmeOpenOptions,
  AcmeMetadata,
  AcmeArtifact
>({
  name: "acme",

  environment(options) {
    return {
      async prepare(ctx) {
        const template = await acme.createTemplate({
          image: options.image,
          name: ctx.templateName,
          region: options.region,
          resources: ctx.resources,
        });
        const sandbox = adaptAcmeSandbox(template);
        await ctx.runPreparation(sandbox);
        const captured = await template.capture();
        return {
          artifact: { templateId: captured.id },
          reused: captured.reused,
        };
      },

      async open(ctx, source) {
        const remote =
          ctx.instance.kind === "restore"
            ? await acme.restore({
                id: ctx.instance.metadata.remoteId,
                name: ctx.instance.name,
              })
            : await acme.create({
                name: ctx.instance.name,
                networkPolicy: ctx.options.networkPolicy,
                source:
                  source.kind === "base"
                    ? { image: options.image }
                    : { templateId: source.artifact.templateId },
              });

        return {
          sandbox: adaptAcmeSandbox(remote),
          captureMetadata: async () => ({ remoteId: remote.id }),
          stop: () => remote.stop(),
          shutdown: () => remote.stop(),
          delete: () => remote.delete(),
        };
      },
    };
  },
});
```

Authoring remains the same as a built-in environment:

```ts
export const environment = AcmeSandbox.environment({
  image: "acme/node@sha256:...",
  region: "iad1",
  prepare: async (sandbox) => {
    await sandbox.run({ command: "install-agent-dependencies" });
  },
});

export default defineSandbox(() =>
  environment.open({
    networkPolicy: "deny-all",
  }),
);
```

## Cross-session native reuse

Core does not expose cross-session sharing. A custom provider may reuse native
compute internally if it still returns a session-owned logical view.

For example, one provider can combine team-scoped compute with a session-scoped
Drive:

```ts
interface TeamWorkspaceOpenOptions {
  readonly teamId: string;
  readonly workspaceId: string;
}

async function open(ctx, source) {
  const compute = await openTeamCompute({
    key: hash(ctx.options.teamId),
  });

  const workspace =
    ctx.instance.kind === "restore"
      ? await restoreWorkspace(ctx.instance.metadata)
      : await createSessionWorkspace({
          key: hash(ctx.options.teamId, ctx.options.workspaceId),
        });

  const mountPath = `/eve/sessions/${hash(ctx.options.workspaceId)}`;
  const attachment = await attachWorkspace({ compute, mountPath, workspace });

  return {
    sandbox: createScopedSandboxSession({
      id: ctx.instance.name,
      nativeSandbox: compute,
      workspaceRoot: mountPath,
    }),
    captureMetadata: async () => ({
      mountPath,
      workspaceId: workspace.id,
    }),
    stop: () => attachment.detach(),
    shutdown: () => attachment.detach(),
    delete: async () => {
      await attachment.detach();
      await workspace.delete();
    },
  };
}
```

The sandbox definition still calls only `open()`:

```ts
export default defineSandbox(({ session }) =>
  environment.open({
    teamId: requireTeamId(session),
    workspaceId: session.id,
  }),
);
```

The provider must not let one session's lifecycle methods stop or delete shared
team compute. A session-specific path is not a security boundary: mutually
untrusted sessions require separate native compute or stronger provider-owned
isolation.

## Built-in environments

All built-ins expose only `open()`:

```ts
DefaultSandbox.environment().open();
VercelSandbox.environment().open(options);
DockerSandbox.environment().open(options);
DockerSandbox.image(reference).open(options);
DockerSandbox.dockerfile().open(options);
MicrosandboxSandbox.environment().open(options);
MicrosandboxSandbox.image(reference).open(options);
MicrosandboxSandbox.dockerfile().open(options);
JustBashSandbox.environment().open();
```

The experimental Vercel image environment follows the same rule:

```ts
ExperimentalVercelDockerfile.environment({ region: "iad1" }).open({
  networkPolicy: "deny-all",
  resources: { vcpus: 4 },
});
```

## Parent inheritance

Parent inheritance remains explicit and does not call an environment method:

```ts
import { defineParentSandbox } from "eve/sandbox";

export default defineParentSandbox();
```

The child uses the parent's exact logical sandbox and lifecycle ownership.

## Core removals

The implementation should remove:

- `environment.create()`;
- `environment.getOrCreate()`;
- `SandboxNamedOptions`;
- authored sandbox names;
- the `shared` key-derivation branch;
- provider-owned shared-lifetime guards;
- shared-configuration tags and conflict checks that exist only for the removed
  core sharing API.

Provider SDKs may still have native methods named `getOrCreate`; those are
private implementation details and are not renamed mechanically.

## Observable invariants

- A sandbox selector returns the exact live session returned by `open()`.
- Core derives one logical sandbox identity for the current eve session.
- `open()` creates or reconnects; the author does not distinguish those paths.
- Provider restoration and prepared source are explicit, independent unions.
- Built-in providers do not expose cross-session sharing.
- Custom providers may compose shared native resources only behind a
  session-owned logical view.
- Initial network policy belongs in `open()`; later policy changes use
  `sandbox.setNetworkPolicy()`.
- Build and development activation complete provider preparation before
  serving traffic.
- Runtime never rebuilds or mutates prepared artifacts.
