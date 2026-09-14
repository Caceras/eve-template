import { createDockerSandboxProvider } from "#execution/sandbox/bindings/local.js";
import type {
  DockerSandboxEnvironmentOptions,
  DockerSandboxRuntimeOptions,
} from "#public/sandbox/docker-sandbox.js";
import type { SandboxEnvironment } from "#shared/sandbox-environment.js";
import {
  defineSandboxProvider,
  type SandboxProviderEnvironmentOptions,
} from "#shared/sandbox-provider.js";

export type {
  DockerSandboxEnvironmentOptions,
  DockerSandboxRuntimeOptions,
} from "#public/sandbox/docker-sandbox.js";

type DockerEnvironmentInput = SandboxProviderEnvironmentOptions<DockerSandboxEnvironmentOptions>;
type DockerfileEnvironmentInput = Omit<DockerEnvironmentInput, "image">;

const provider = defineSandboxProvider<
  DockerSandboxEnvironmentOptions,
  DockerSandboxRuntimeOptions
>({
  name: "docker",
  environment(options) {
    return createDockerSandboxProvider(options);
  },
});

export const DockerSandbox = {
  ...provider,
  dockerfile(
    options: DockerfileEnvironmentInput = {},
  ): SandboxEnvironment<DockerSandboxRuntimeOptions> {
    const environment = provider.environment(options);
    return Object.defineProperty(environment, "kind", { value: "dockerfile" });
  },
  image(
    reference: string,
    options: DockerfileEnvironmentInput = {},
  ): SandboxEnvironment<DockerSandboxRuntimeOptions> {
    const environment = provider.environment({ ...options, image: reference });
    return Object.defineProperty(environment, "kind", { value: "image" });
  },
};
