import {
  createSandboxProviderResources,
  type SandboxProviderHandle,
  type SandboxProviderImplementation,
  type SandboxProviderTags,
} from "#shared/sandbox-provider.js";
import type { SandboxSession } from "#shared/sandbox-session.js";

export function createSandboxProviderHarness<Options extends object | undefined>(
  implementation: SandboxProviderImplementation<Options, Record<string, unknown>>,
  options: Options,
) {
  return {
    async prepare(input: {
      readonly appRoot: string;
      readonly dockerfile?: import("#shared/sandbox-provider.js").SandboxDockerfileInput;
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
      return await implementation.prepare({
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
    },
    async getOrCreate(input: {
      readonly appRoot: string;
      readonly existing?: Record<string, unknown>;
      readonly resourcesKey?: string;
      readonly sandboxName: string;
      readonly tags?: SandboxProviderTags;
      readonly templateName: string | null;
    }): Promise<SandboxProviderHandle<Record<string, unknown>>> {
      return await implementation.getOrCreate({
        appRoot: input.appRoot,
        existing: input.existing,
        handle: (providerHandle) => providerHandle,
        options,
        resources: createSandboxProviderResources({ resourcesKey: input.resourcesKey }),
        sandboxName: input.sandboxName,
        tags: input.tags,
        templateName: input.templateName,
      });
    },
  };
}
