import type { CompiledWorkspaceResourceRoot } from "#compiler/manifest.js";
import type { ResolvedSandboxDefinition } from "#runtime/types.js";
import { getSandboxEnvironmentPreparation } from "#shared/sandbox-environment.js";

type SandboxGeneration = {
  readonly contentHash?: string;
  readonly revisionHash: string;
};

export type RuntimeSandboxTemplatePlan = SandboxGeneration &
  ({ readonly kind: "none" } | { readonly kind: "prepared" });

export function createRuntimeSandboxTemplatePlan(input: {
  readonly definition: ResolvedSandboxDefinition;
  readonly workspaceResourceRoot: CompiledWorkspaceResourceRoot;
}): RuntimeSandboxTemplatePlan {
  const revisionHash = input.definition.revisionHash;
  const contentHash = input.workspaceResourceRoot.contentHash;
  const requiresPreparation =
    input.definition.kind === "independent" &&
    (input.definition.environment.kind === "prepared" ||
      input.definition.environment.kind === "dockerfile" ||
      getSandboxEnvironmentPreparation(input.definition.environment) !== undefined);

  if (
    requiresPreparation ||
    contentHash !== undefined ||
    input.workspaceResourceRoot.rootEntries.length > 0
  ) {
    return { contentHash, kind: "prepared", revisionHash };
  }
  return { kind: "none", revisionHash };
}
