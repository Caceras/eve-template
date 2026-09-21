import { readFile, writeFile } from "node:fs/promises";

import type { RuntimeCompiledArtifactsSource } from "#runtime/compiled-artifacts-source.js";
import { readBundledCompiledArtifacts } from "#runtime/loaders/bundled-artifacts.js";
import { resolveRuntimeCompilerArtifactPaths } from "#runtime/loaders/artifact-paths.js";
import {
  createSandboxPreparedArtifactsManifest,
  sandboxPreparedArtifactsManifestSchema,
  type SandboxPreparedArtifactEntry,
  type SandboxPreparedArtifactsManifest,
} from "#shared/sandbox-prepared-artifacts.js";
import type { SandboxPreparedArtifact } from "#shared/sandbox-provider.js";

export async function writeSandboxPreparedArtifactsManifest(input: {
  readonly compileDirectoryPath: string;
  readonly entries: readonly SandboxPreparedArtifactEntry[];
}): Promise<void> {
  if (input.entries.length === 0) return;
  const path = `${input.compileDirectoryPath}/sandbox-prepared-artifacts.json`;
  let existing: SandboxPreparedArtifactsManifest | null = null;
  try {
    existing = sandboxPreparedArtifactsManifestSchema.parse(
      JSON.parse(await readFile(path, "utf8")),
    );
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  const entries = new Map(
    existing?.entries.map((entry) => [artifactKey(entry.providerName, entry.templateName), entry]),
  );
  for (const entry of input.entries) {
    entries.set(artifactKey(entry.providerName, entry.templateName), entry);
  }
  await writeFile(
    path,
    `${JSON.stringify(createSandboxPreparedArtifactsManifest([...entries.values()]), null, 2)}\n`,
  );
}

export async function loadSandboxPreparedArtifact(input: {
  readonly compiledArtifactsSource: RuntimeCompiledArtifactsSource;
  readonly providerName: string;
  readonly templateName: string;
}): Promise<SandboxPreparedArtifact | undefined> {
  const manifest = await loadSandboxPreparedArtifactsManifest(input.compiledArtifactsSource);
  const entry = manifest?.entries.find(
    (candidate) =>
      candidate.providerName === input.providerName &&
      candidate.templateName === input.templateName,
  );
  console.info(
    `[eve:sandbox-debug] load source=${input.compiledArtifactsSource.kind} provider=${input.providerName} template=${input.templateName} entries=${manifest?.entries.length ?? 0} match=${entry === undefined ? "absent" : summarizeArtifact(entry.artifact)}`,
  );
  return entry?.artifact;
}

export async function loadSandboxPreparedArtifactsManifest(
  source: RuntimeCompiledArtifactsSource,
): Promise<SandboxPreparedArtifactsManifest | null> {
  if (source.kind === "bundled") {
    return readBundledCompiledArtifacts()?.sandboxPreparedArtifacts ?? null;
  }
  const path = resolveRuntimeCompilerArtifactPaths(source.appRoot).sandboxPreparedArtifactsPath;
  try {
    return sandboxPreparedArtifactsManifestSchema.parse(JSON.parse(await readFile(path, "utf8")));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
    throw error;
  }
}

function summarizeArtifact(artifact: SandboxPreparedArtifact): string {
  if (artifact === null) return "null";
  if (typeof artifact !== "object" || Array.isArray(artifact)) return typeof artifact;
  const keys = Object.keys(artifact).sort().join(",") || "empty";
  return `keys:${keys};snapshot:${typeof Reflect.get(artifact, "snapshotId") === "string" ? "present" : "absent"}`;
}

function artifactKey(providerName: string, templateName: string): string {
  return `${providerName}\0${templateName}`;
}
