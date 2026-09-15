import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolveSandboxDockerfile } from "#execution/sandbox/dockerfile.js";
import type { CompiledSandboxDefinition } from "#compiler/manifest.js";
import type { ModuleBackedDefinitionLoadOptions } from "#compiler/normalize-helpers.js";
import type { SandboxSourceRef } from "#discover/manifest.js";
import { getAuthoredModuleExport } from "#internal/authored-module.js";
import { getBoundSandboxEnvironment, isSandboxEnvironment } from "#shared/sandbox-environment.js";

const PARENT = Symbol.for("eve.sandbox-parent-definition");
const SELECTOR = Symbol.for("eve.sandbox-selector");

export async function compileSandboxDefinition(
  _agentRoot: string,
  source: SandboxSourceRef,
  options: ModuleBackedDefinitionLoadOptions,
): Promise<CompiledSandboxDefinition> {
  const namespace = await options.loadNamespace(source.sourceId);
  const selector = getAuthoredModuleExport(namespace, source);
  if (typeof selector !== "function" || Reflect.get(selector, SELECTOR) !== true)
    throw new Error(`Expected sandbox "${source.logicalPath}" to default-export defineSandbox().`);
  const inheritsParent = Reflect.get(selector, PARENT) === true;
  const candidate = isSandboxEnvironment(namespace.environment)
    ? namespace.environment
    : getBoundSandboxEnvironment(selector);
  if (!inheritsParent && candidate === undefined)
    throw new Error(`Sandbox "${source.logicalPath}" must export an environment.`);
  const dockerfile =
    candidate?.kind === "dockerfile" ? await resolveSandboxDockerfile(_agentRoot) : undefined;
  if (candidate?.kind === "dockerfile" && dockerfile === undefined)
    throw new Error(
      `Sandbox "${source.logicalPath}" uses a Dockerfile environment, but agent/sandbox/Dockerfile was not found.`,
    );
  const authoredSource =
    options.binding.backing.kind === "programmatic"
      ? (options.binding.backing.semanticRevision ?? options.binding.backing.revision)
      : await readFile(options.binding.backing.sourcePath);
  const revision = createHash("sha256").update("sandbox-source\0").update(authoredSource);
  if (dockerfile !== undefined) {
    revision.update("\0dockerfile-context\0").update(dockerfile.contentHash);
  }
  return {
    providerName: candidate?.provider,
    environmentExportName: isSandboxEnvironment(namespace.environment) ? "environment" : undefined,
    exportName: source.exportName,
    inheritsParent: inheritsParent || undefined,
    logicalPath: source.logicalPath,
    revisionHash: revision.digest("hex"),
    sourceId: source.sourceId,
    sourceKind: "module",
  };
}
