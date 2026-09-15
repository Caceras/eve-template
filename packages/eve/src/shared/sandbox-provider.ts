import {
  createSandboxEnvironment,
  type SandboxEnvironment,
  type SandboxPrepare,
} from "#shared/sandbox-environment.js";
import type { SandboxSession } from "#shared/sandbox-session.js";

export interface SandboxDeleteOptions {
  readonly abortSignal?: AbortSignal;
}

export type SandboxProviderTags = Readonly<Record<string, string>>;
export type NoSandboxProviderMetadata = Record<never, never>;

export interface SandboxDockerfileInput {
  readonly contextPath: string;
  readonly contentHash: string;
  readonly path: string;
}

export interface SandboxProviderResourceFile {
  readonly content: string | Uint8Array;
  readonly relativePath: string;
}

export interface SandboxProviderResourceTree {
  readonly files: readonly SandboxProviderResourceFile[];
  readonly key: string;
  readonly mountPath: string;
  readonly targetPath: string;
}

export type SandboxProviderResourceSource =
  | { readonly kind: "none" }
  | { readonly key: string; readonly kind: "inline" }
  | { readonly key: string; readonly kind: "materialized"; readonly path: string }
  | { readonly key: string; readonly kind: "reference" };

export interface SandboxProviderResources {
  readonly skills?: SandboxProviderResourceTree;
  readonly source: SandboxProviderResourceSource;
  readonly workspace?: SandboxProviderResourceTree;
}

export interface SandboxProviderTargetFile {
  readonly content: string | Uint8Array;
  readonly path: string;
}

export function providerResourceTargetFiles(
  resources: SandboxProviderResources,
): SandboxProviderTargetFile[] {
  return [resources.workspace, resources.skills].flatMap((resource) =>
    resource === undefined
      ? []
      : resource.files.map((file) => ({
          content: file.content,
          path: `${resource.targetPath}/${file.relativePath}`,
        })),
  );
}

export type SandboxPreparedArtifact =
  | null
  | boolean
  | number
  | string
  | readonly SandboxPreparedArtifact[]
  | { readonly [key: string]: SandboxPreparedArtifact };

export type SandboxProviderMetadata = Readonly<Record<string, SandboxPreparedArtifact>>;

export function isSandboxPreparedArtifactRecord(
  artifact: SandboxPreparedArtifact | undefined,
): artifact is { readonly [key: string]: SandboxPreparedArtifact } {
  return typeof artifact === "object" && artifact !== null && !Array.isArray(artifact);
}

export interface SandboxProviderPrepareContext {
  readonly appRoot: string;
  readonly dockerfile?: SandboxDockerfileInput;
  readonly log?: (message: string) => void;
  readonly resources: SandboxProviderResources;
  runPreparation(sandbox: SandboxSession): Promise<void>;
  readonly templateName: string;
}

export type SandboxProviderSource<
  PreparedArtifact extends SandboxPreparedArtifact = SandboxPreparedArtifact,
> =
  | { readonly kind: "base" }
  | {
      readonly artifact: PreparedArtifact;
      readonly kind: "prepared";
      readonly templateName: string;
    };

export type SandboxProviderSession<Metadata> =
  | { readonly kind: "create"; readonly name: string }
  | {
      readonly kind: "restore";
      readonly metadata: Readonly<Metadata>;
      readonly name: string;
    };

export interface SandboxProviderCreateContext<CreateOptions, Metadata> {
  readonly appRoot: string;
  readonly options: Readonly<CreateOptions>;
  readonly resources: SandboxProviderResources;
  readonly session: SandboxProviderSession<Metadata>;
  readonly tags?: SandboxProviderTags;
}

export interface SandboxProviderHandle<Metadata> {
  captureMetadata(): Promise<Metadata>;
  readonly sandbox: SandboxSession;
  delete(options?: SandboxDeleteOptions): Promise<void>;
  shutdown(): Promise<void>;
  stop(): Promise<void>;
}

export interface SandboxProviderImplementation<
  CreateOptions,
  Metadata,
  PreparedArtifact extends SandboxPreparedArtifact = SandboxPreparedArtifact,
> {
  prepare(
    context: SandboxProviderPrepareContext,
  ): Promise<{ readonly artifact: PreparedArtifact; readonly reused: boolean }>;
  getOrCreate(
    context: SandboxProviderCreateContext<CreateOptions, Metadata>,
    source: SandboxProviderSource<PreparedArtifact>,
  ): Promise<SandboxProviderHandle<Metadata>>;
}

export type SandboxProviderDefinition<
  EnvironmentOptions extends object,
  CreateOptions extends object | undefined,
  Metadata extends object,
  PreparedArtifact extends SandboxPreparedArtifact,
> = {
  readonly name: string;
  kind?(options: Readonly<EnvironmentOptions>): SandboxEnvironment["kind"];
} & (
  | {
      environment(
        options: Readonly<EnvironmentOptions>,
      ): SandboxProviderImplementation<CreateOptions, Metadata, PreparedArtifact>;
      readonly select?: never;
    }
  | {
      readonly environment?: never;
      select(
        options: Readonly<EnvironmentOptions>,
        prepare: SandboxPrepare | undefined,
      ): SandboxEnvironment<CreateOptions>;
    }
);

export type SandboxProviderEnvironmentOptions<Options extends object> = Omit<Options, "prepare"> & {
  readonly prepare?: SandboxPrepare;
};

export type SandboxProviderEnvironmentArguments<Options extends object> =
  Record<never, never> extends Options
    ? [options?: SandboxProviderEnvironmentOptions<Options>]
    : [options: SandboxProviderEnvironmentOptions<Options>];

export interface SandboxProvider<
  EnvironmentOptions extends object,
  CreateOptions extends object | undefined,
> {
  readonly name: string;
  environment(
    ...args: SandboxProviderEnvironmentArguments<EnvironmentOptions>
  ): SandboxEnvironment<CreateOptions>;
}

type ErasedSandboxProviderImplementation = SandboxProviderImplementation<
  object | undefined,
  SandboxProviderMetadata
>;

export interface SandboxProviderRuntime {
  readonly implementation: ErasedSandboxProviderImplementation;
  readonly prepare?: SandboxPrepare;
  readonly providerName: string;
}

export function defineSandboxProvider<
  EnvironmentOptions extends object,
  CreateOptions extends object | undefined = undefined,
  Metadata extends object = NoSandboxProviderMetadata,
  PreparedArtifact extends SandboxPreparedArtifact = SandboxPreparedArtifact,
>(
  definition: SandboxProviderDefinition<
    EnvironmentOptions,
    CreateOptions,
    Metadata,
    PreparedArtifact
  >,
): SandboxProvider<EnvironmentOptions, CreateOptions> {
  return {
    name: definition.name,
    environment(...args: SandboxProviderEnvironmentArguments<EnvironmentOptions>) {
      const { options, prepare } = splitSandboxEnvironmentOptions<EnvironmentOptions>(args[0]);
      if (definition.select !== undefined) return definition.select(options, prepare);
      return createSandboxEnvironment({
        configuration: { options, prepare },
        kind: definition.kind?.(options) ?? (prepare === undefined ? "default" : "prepared"),
        runtime: {
          implementation: eraseSandboxProviderImplementation(definition.environment(options)),
          prepare,
          providerName: definition.name,
        },
      });
    },
  };
}

function splitSandboxEnvironmentOptions<Options extends object>(
  authoredOptions: SandboxProviderEnvironmentOptions<Options> | undefined,
): { readonly options: Readonly<Options>; readonly prepare: SandboxPrepare | undefined } {
  const { prepare, ...options } = authoredOptions ?? {};
  // Omit cannot prove that removing eve's `prepare` key reconstructs the
  // provider's generic options, even though that is how the public type is defined.
  return { options: options as Options, prepare };
}

function eraseSandboxProviderImplementation<
  Options,
  Metadata,
  Artifact extends SandboxPreparedArtifact,
>(
  implementation: SandboxProviderImplementation<Options, Metadata, Artifact>,
): ErasedSandboxProviderImplementation {
  // Runtime registries contain heterogeneous providers; exact types remain at
  // each implementation boundary and are erased only when entering the registry.
  return implementation as ErasedSandboxProviderImplementation;
}

export function createSandboxProviderResources(input: {
  readonly resourcesKey?: string;
  readonly resourcesPath?: string;
  readonly seedFiles?: readonly {
    readonly content: string | Uint8Array;
    readonly path: string;
  }[];
}): SandboxProviderResources {
  if (input.resourcesKey === undefined) return { source: { kind: "none" } };
  const files = input.seedFiles ?? [];
  const source: SandboxProviderResourceSource =
    input.resourcesPath !== undefined
      ? { key: input.resourcesKey, kind: "materialized", path: input.resourcesPath }
      : input.seedFiles !== undefined
        ? { key: input.resourcesKey, kind: "inline" }
        : { key: input.resourcesKey, kind: "reference" };
  return {
    skills: createResourceTree({
      files: files.filter((file) => file.path.startsWith("$HOME/.agents/skills/")),
      key: `${input.resourcesKey}:skills`,
      mountPath: "/eve/resources/skills",
      prefix: "$HOME/.agents/skills/",
      targetPath: "$HOME/.agents/skills",
    }),
    source,
    workspace: createResourceTree({
      files: files.filter((file) => !file.path.startsWith("$HOME/.agents/skills/")),
      key: `${input.resourcesKey}:workspace`,
      mountPath: "/eve/resources/workspace",
      prefix: "/workspace/",
      targetPath: "/workspace",
    }),
  };
}

function createResourceTree(input: {
  readonly files: readonly { readonly content: string | Uint8Array; readonly path: string }[];
  readonly key: string;
  readonly mountPath: string;
  readonly prefix: string;
  readonly targetPath: string;
}): SandboxProviderResourceTree {
  return {
    files: input.files.map((file) => ({
      content: file.content,
      relativePath: file.path.startsWith(input.prefix)
        ? file.path.slice(input.prefix.length)
        : file.path,
    })),
    key: input.key,
    mountPath: input.mountPath,
    targetPath: input.targetPath,
  };
}
