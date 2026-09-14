import { createMicrosandboxSandboxProvider } from "#execution/sandbox/bindings/local.js";
import type {
  MicrosandboxSandboxCreateOptions,
  MicrosandboxSandboxRuntimeOptions,
} from "#public/sandbox/microsandbox-sandbox.js";
import type { SandboxEnvironment } from "#shared/sandbox-environment.js";
import {
  defineSandboxProvider,
  type SandboxProviderEnvironmentOptions,
} from "#shared/sandbox-provider.js";

export type MicrosandboxEnvironmentOptions = MicrosandboxSandboxCreateOptions;

type MicrosandboxEnvironmentInput =
  SandboxProviderEnvironmentOptions<MicrosandboxEnvironmentOptions>;
type DockerfileEnvironmentInput = Omit<MicrosandboxEnvironmentInput, "image">;

const provider = defineSandboxProvider<
  MicrosandboxEnvironmentOptions,
  MicrosandboxSandboxRuntimeOptions
>({
  name: "microsandbox",
  environment: (options) => createMicrosandboxSandboxProvider(options),
});

export const MicrosandboxSandbox = {
  ...provider,
  dockerfile(
    options: DockerfileEnvironmentInput = {},
  ): SandboxEnvironment<MicrosandboxSandboxRuntimeOptions> {
    const environment = provider.environment(options);
    return Object.defineProperty(environment, "kind", { value: "dockerfile" });
  },
  image(
    reference: string,
    options: DockerfileEnvironmentInput = {},
  ): SandboxEnvironment<MicrosandboxSandboxRuntimeOptions> {
    const environment = provider.environment({ ...options, image: reference });
    return Object.defineProperty(environment, "kind", { value: "image" });
  },
};
