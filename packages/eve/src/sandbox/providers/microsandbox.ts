import { createMicrosandboxSandboxProvider } from "#execution/sandbox/bindings/local.js";
import type { MicrosandboxPreparedArtifact } from "#execution/sandbox/bindings/microsandbox-lifecycle.js";
import type { MicrosandboxSessionMetadata } from "#execution/sandbox/bindings/microsandbox-metadata.js";
import type {
  MicrosandboxSandboxCreateOptions,
  MicrosandboxSandboxRuntimeOptions,
} from "#public/sandbox/microsandbox-sandbox.js";
import type { SandboxEnvironment } from "#shared/sandbox-environment.js";
import { defineSandboxProvider } from "#shared/sandbox-provider.js";

export type MicrosandboxEnvironmentOptions = MicrosandboxSandboxCreateOptions;

type DockerfileEnvironmentInput = Omit<MicrosandboxEnvironmentOptions, "image">;

const provider = defineSandboxProvider<
  MicrosandboxEnvironmentOptions,
  MicrosandboxSandboxRuntimeOptions,
  MicrosandboxPreparedArtifact,
  MicrosandboxSessionMetadata
>({
  name: "microsandbox",
  environment: (options) => createMicrosandboxSandboxProvider(options),
});

export const MicrosandboxSandbox = {
  ...provider,
  dockerfile(
    options: DockerfileEnvironmentInput = {},
  ): SandboxEnvironment<MicrosandboxSandboxRuntimeOptions> {
    return provider.environment(options);
  },
  image(
    reference: string,
    options: DockerfileEnvironmentInput = {},
  ): SandboxEnvironment<MicrosandboxSandboxRuntimeOptions> {
    return provider.environment({ ...options, image: reference });
  },
};
