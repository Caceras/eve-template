import {
  createSandboxEnvironment,
  type SandboxEnvironment,
  type SandboxSelectorContext,
} from "#shared/sandbox-environment.js";
import type { SandboxSession } from "#shared/sandbox-session.js";

export interface SandboxDeleteOptions {
  readonly abortSignal?: AbortSignal;
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
  | { readonly key: string; readonly kind: "materialized"; readonly path: string };

export interface SandboxProviderResources {
  readonly skills?: SandboxProviderResourceTree;
  readonly source: SandboxProviderResourceSource;
  readonly workspace?: SandboxProviderResourceTree;
}

export function sandboxProviderResourceIdentity(resources: SandboxProviderResources): object {
  return {
    skills: resources.skills?.key,
    workspace: resources.workspace?.key,
  };
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

export function isSandboxPreparedArtifact(value: unknown): value is SandboxPreparedArtifact {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return true;
  }
  if (Array.isArray(value)) return value.every(isSandboxPreparedArtifact);
  return (
    typeof value === "object" &&
    value !== null &&
    Object.values(value).every(isSandboxPreparedArtifact)
  );
}

export function isSandboxPreparedArtifactRecord(
  artifact: unknown,
): artifact is { readonly [key: string]: SandboxPreparedArtifact } {
  return typeof artifact === "object" && artifact !== null && !Array.isArray(artifact);
}

export interface SandboxProviderFiles {
  list(): Promise<readonly string[]>;
  read(path: string): Promise<Uint8Array>;
  readText(path: string): Promise<string>;
}

export interface SandboxProviderHost {
  loadOptionalPackage<T>(input: {
    readonly autoInstall: boolean;
    readonly importModule: () => Promise<T>;
    readonly missingMessage: string;
    readonly packageName: string;
  }): Promise<T>;
  resolveProjectPath(path: string): string;
}

export interface SandboxProviderPrepareContext {
  readonly files: SandboxProviderFiles;
  readonly host: SandboxProviderHost;
  readonly log?: (message: string) => void;
  readonly resources: SandboxProviderResources;
  readonly storagePath: string;
}

export interface SandboxProviderSessionContext {
  readonly host: SandboxProviderHost;
  readonly session: SandboxSelectorContext["session"];
  readonly storagePath: string;
}

export interface SandboxProviderHandle {
  readonly sandbox: SandboxSession;
  onRuntimeShutdown(): Promise<void>;
  onSessionDelete(options?: SandboxDeleteOptions): Promise<void>;
  onSessionStop(): Promise<void>;
}

export interface SandboxProviderImplementation<
  OpenOptions extends object | undefined,
  PreparedArtifact extends SandboxPreparedArtifact,
  SessionState,
> {
  prepare(context: SandboxProviderPrepareContext): Promise<PreparedArtifact>;
  resume(
    context: SandboxProviderSessionContext,
    options: Readonly<OpenOptions> | undefined,
    artifact: Readonly<PreparedArtifact>,
    state: Readonly<SessionState>,
  ): Promise<SandboxProviderHandle>;
  start(
    context: SandboxProviderSessionContext,
    options: Readonly<OpenOptions> | undefined,
    artifact: Readonly<PreparedArtifact>,
  ): Promise<{ readonly handle: SandboxProviderHandle; readonly state: SessionState }>;
}

type SandboxOptionArguments<Options extends object | undefined> = Options extends undefined
  ? [options?: undefined]
  : Record<never, never> extends Options
    ? [options?: Readonly<Options>]
    : [options: Readonly<Options>];

export type SandboxProviderDefinition<
  EnvironmentOptions extends object | undefined,
  OpenOptions extends object | undefined,
  PreparedArtifact extends SandboxPreparedArtifact,
  SessionState,
> = {
  readonly name: string;
  environment(
    ...args: SandboxOptionArguments<EnvironmentOptions>
  ): SandboxProviderImplementation<OpenOptions, PreparedArtifact, SessionState>;
};

export interface SandboxProvider<
  EnvironmentOptions extends object | undefined,
  OpenOptions extends object | undefined,
> {
  readonly name: string;
  environment(...args: SandboxOptionArguments<EnvironmentOptions>): SandboxEnvironment<OpenOptions>;
}

type ErasedSandboxProviderImplementation = SandboxProviderImplementation<
  object | undefined,
  SandboxPreparedArtifact,
  SandboxPreparedArtifact
>;

export interface SandboxProviderRuntime {
  readonly implementation: ErasedSandboxProviderImplementation;
  readonly providerName: string;
}

export function defineSandboxProvider<
  EnvironmentOptions extends object | undefined = undefined,
  OpenOptions extends object | undefined = undefined,
  PreparedArtifact extends SandboxPreparedArtifact = SandboxPreparedArtifact,
  SessionState = SandboxPreparedArtifact,
>(
  definition: SandboxProviderDefinition<
    EnvironmentOptions,
    OpenOptions,
    PreparedArtifact,
    SessionState
  >,
): SandboxProvider<EnvironmentOptions, OpenOptions> {
  return {
    name: definition.name,
    environment(...args: SandboxOptionArguments<EnvironmentOptions>) {
      return createSandboxEnvironment({
        configuration: args[0],
        runtime: {
          implementation: eraseSandboxProviderImplementation(definition.environment(...args)),
          providerName: definition.name,
        },
      });
    },
  };
}

function eraseSandboxProviderImplementation<
  Options extends object | undefined,
  Artifact extends SandboxPreparedArtifact,
  SessionState,
>(
  implementation: SandboxProviderImplementation<Options, Artifact, SessionState>,
): ErasedSandboxProviderImplementation {
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
      : { key: input.resourcesKey, kind: "inline" };
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
