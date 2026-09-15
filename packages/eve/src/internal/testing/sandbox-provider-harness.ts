import {
  createSandboxProviderResources,
  type SandboxDockerfileInput,
  type SandboxPreparedArtifact,
  type SandboxProviderHandle,
  type SandboxProviderImplementation,
  type SandboxProviderTags,
} from "#shared/sandbox-provider.js";
import type { SandboxSession } from "#shared/sandbox-session.js";

export function createSandboxProviderHarness<
  Options extends object | undefined,
  Metadata,
  PreparedArtifact extends SandboxPreparedArtifact,
>(
  implementation: SandboxProviderImplementation<Options, Metadata, PreparedArtifact>,
  options: Options,
  harnessOptions: {
    readonly preparedArtifact?: (templateName: string) => PreparedArtifact;
  } = {},
) {
  const preparedArtifacts = new Map<string, PreparedArtifact>();
  return {
    async prepare(input: {
      readonly appRoot: string;
      readonly dockerfile?: SandboxDockerfileInput;
      readonly log?: (message: string) => void;
      readonly resourcesKey?: string;
      readonly resourcesPath?: string;
      readonly runPreparation?: (sandbox: SandboxSession) => Promise<void>;
      readonly seedFiles?: readonly {
        readonly content: string | Uint8Array;
        readonly path: string;
      }[];
      readonly templateName: string;
    }) {
      const result = await implementation.prepare({
        appRoot: input.appRoot,
        dockerfile: input.dockerfile,
        log: input.log,
        resources: createSandboxProviderResources({
          ...input,
          resourcesKey:
            input.resourcesKey ??
            (input.seedFiles === undefined || input.seedFiles.length === 0
              ? undefined
              : "test-resources"),
        }),
        runPreparation: input.runPreparation ?? (async () => {}),
        templateName: input.templateName,
      });
      preparedArtifacts.set(input.templateName, result.artifact);
      return result;
    },
    async getOrCreate(input: {
      readonly appRoot: string;
      readonly existing?: Metadata;
      readonly prepared?: PreparedArtifact;
      readonly resourcesKey?: string;
      readonly sandboxName: string;
      readonly tags?: SandboxProviderTags;
      readonly templateName: string | null;
    }): Promise<SandboxProviderHandle<Metadata>> {
      const prepared =
        input.prepared ??
        (input.templateName === null
          ? undefined
          : (preparedArtifacts.get(input.templateName) ??
            harnessOptions.preparedArtifact?.(input.templateName)));
      const source =
        input.templateName === null
          ? ({ kind: "base" } as const)
          : prepared === undefined
            ? (() => {
                throw new Error(`Missing prepared artifact for template "${input.templateName}".`);
              })()
            : { artifact: prepared, kind: "prepared" as const, templateName: input.templateName };
      return await implementation.getOrCreate(
        {
          appRoot: input.appRoot,
          options,
          resources: createSandboxProviderResources({ resourcesKey: input.resourcesKey }),
          session:
            input.existing === undefined
              ? { kind: "create", name: input.sandboxName }
              : { kind: "restore", metadata: input.existing, name: input.sandboxName },
          tags: input.tags,
        },
        source,
      );
    },
  };
}
