import { resolve } from "node:path";
import type { SandboxProviderHost } from "#shared/sandbox-provider.js";

export function createSandboxProviderHost(appRoot: string): SandboxProviderHost {
  return {
    async loadOptionalPackage(input) {
      if (process.env.VERCEL) {
        try {
          return await input.importModule();
        } catch (error) {
          throw new Error(input.missingMessage, { cause: error });
        }
      }
      const { loadOptionalEnginePackage } =
        await import("#internal/application/optional-package-install.js");
      return await loadOptionalEnginePackage({ appRoot, ...input });
    },
    resolveProjectPath(path) {
      return resolve(appRoot, path);
    },
  };
}
