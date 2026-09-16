import {
  createMicrosandboxHandle,
  type MicrosandboxPreparedArtifact,
  prewarmMicrosandboxTemplate,
} from "#execution/sandbox/bindings/microsandbox-lifecycle.js";
import { enrichMicrosandboxError } from "#execution/sandbox/bindings/microsandbox-create.js";
import type { MicrosandboxSessionMetadata } from "#execution/sandbox/bindings/microsandbox-metadata.js";
import {
  microsandboxOptionsForHash,
  resolveMicrosandboxOptions,
} from "#execution/sandbox/bindings/microsandbox-options.js";
import { createStableHash } from "#execution/sandbox/bindings/microsandbox-runtime.js";
import type {
  MicrosandboxSandboxCreateOptions,
  MicrosandboxSandboxRuntimeOptions,
} from "#public/sandbox/microsandbox-sandbox.js";
import type { SandboxProviderImplementation } from "#shared/sandbox-provider.js";

export { pruneMicrosandboxTemplates } from "#execution/sandbox/bindings/microsandbox-templates.js";

export const MICROSANDBOX_PROVIDER_NAME = "microsandbox";

export function createMicrosandboxSandboxProvider(
  createOptions: MicrosandboxSandboxCreateOptions = {},
): SandboxProviderImplementation<
  MicrosandboxSandboxRuntimeOptions,
  MicrosandboxSessionMetadata,
  MicrosandboxPreparedArtifact
> {
  const options = resolveMicrosandboxOptions(createOptions);
  const optionsHash = createStableHash(JSON.stringify(microsandboxOptionsForHash(options))).slice(
    0,
    20,
  );

  return {
    async prepare(context) {
      try {
        return await prewarmMicrosandboxTemplate({
          context,
          options,
          optionsHash,
          providerName: MICROSANDBOX_PROVIDER_NAME,
        });
      } catch (error) {
        throw enrichMicrosandboxError({
          context: `Failed to prepare microsandbox template "${context.templateName}"`,
          error,
        });
      }
    },
    async open(context, source) {
      return await createMicrosandboxHandle({
        context,
        source,
        options,
        optionsHash,
        providerName: MICROSANDBOX_PROVIDER_NAME,
      });
    },
  };
}
