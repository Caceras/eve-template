import { randomUUID } from "node:crypto";

import {
  hydrateSandboxProviderResources,
  prepareImmutableResources,
  resolveImmutableResourcesPath,
} from "#execution/sandbox/bindings/immutable-resources.js";

import {
  assertDockerDaemonAvailable,
  createDockerCli,
} from "#execution/sandbox/bindings/docker-cli.js";
import {
  buildSandboxDockerfile,
  dockerfileImageReference,
  publishDockerImageForMicrosandbox,
} from "#execution/sandbox/dockerfile.js";
import { mkdir, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

import {
  createFileBackedInternalSandboxSession,
  touchDirectory,
} from "#execution/sandbox/bindings/local-provider-utils.js";
import {
  MICROSANDBOX_METADATA_VERSION,
  type MicrosandboxSessionMetadata,
  type MicrosandboxTemplateMetadata,
  readTemplateMetadata,
  resolveMicrosandboxMetadataPath,
  writeTemplateMetadata,
} from "#execution/sandbox/bindings/microsandbox-metadata.js";
import type { ResolvedMicrosandboxOptions } from "#execution/sandbox/bindings/microsandbox-options.js";
import type { MicrosandboxSandboxRuntimeOptions } from "#public/sandbox/microsandbox-sandbox.js";
import {
  connectMicrosandbox,
  createPreparedMicrosandbox,
  createProviderName,
  doesPathExist,
  isMicrosandboxNotFoundError,
  loadMicrosandboxModule,
  type MicrosandboxVm,
  removeSnapshotIfExists,
  sandboxExists,
  snapshotExists,
} from "#execution/sandbox/bindings/microsandbox-runtime.js";
import {
  resolveMicrosandboxSessionRootPath,
  resolveMicrosandboxTemplateRootPath,
} from "#execution/sandbox/bindings/microsandbox-templates.js";
import { createLoggingSandboxSession } from "#execution/sandbox/logging-session.js";
import { withDevelopmentSandboxMetadataPathTag } from "#execution/sandbox/development-run.js";
import { buildSandboxSession } from "#execution/sandbox/session.js";
import { resolveSandboxCacheDirectory } from "#internal/application/paths.js";
import {
  isSandboxPreparedArtifactRecord,
  type SandboxPreparedArtifact,
  type SandboxProviderCreateContext,
  type SandboxProviderHandle,
  type SandboxProviderPrepareContext,
  type SandboxProviderSource,
  type SandboxProviderResources,
} from "#shared/sandbox-provider.js";
import { SandboxTemplateNotProvisionedError } from "#shared/sandbox-template-error.js";
import type { InternalSandboxSession } from "#shared/sandbox-session.js";

type LiveMicrosandboxOptions = ResolvedMicrosandboxOptions & MicrosandboxSandboxRuntimeOptions;

export type MicrosandboxPreparedArtifact = {
  readonly image: string | null;
  readonly optionsHash: string;
  readonly snapshotName: string;
  readonly version: typeof MICROSANDBOX_METADATA_VERSION;
};

const activeMicrosandboxSessionHandles = new Map<
  string,
  SandboxProviderHandle<MicrosandboxSessionMetadata>
>();

export async function prewarmMicrosandboxTemplate(input: {
  readonly providerName: string;
  readonly options: ResolvedMicrosandboxOptions;
  readonly optionsHash: string;
  readonly context: SandboxProviderPrepareContext;
}): Promise<{ readonly artifact: MicrosandboxPreparedArtifact; readonly reused: boolean }> {
  input.context.log?.("loading microsandbox runtime");
  const module = await loadMicrosandboxModule({
    appRoot: input.context.appRoot,
    log: input.context.log,
    options: input.options,
  });
  const cacheDirectory = resolveSandboxCacheDirectory(input.context.appRoot);
  const templateRootPath = resolveMicrosandboxTemplateRootPath(
    cacheDirectory,
    input.context.templateName,
  );
  const metadataPath = resolveMicrosandboxMetadataPath(templateRootPath);
  input.context.log?.("checking cached snapshot");
  const existing = await readTemplateMetadata(metadataPath);

  if (
    existing?.optionsHash === input.optionsHash &&
    (await snapshotExists(module, existing.snapshotName))
  ) {
    input.context.log?.("reusing cached snapshot");
    await touchDirectory(templateRootPath);
    return { artifact: microsandboxTemplateArtifact(existing), reused: true };
  }

  const snapshotName = createProviderName(
    "eve-sbx-tpl",
    input.context.templateName,
    input.optionsHash,
  );
  const temporaryTemplateRootPath = `${templateRootPath}.${randomUUID()}.tmp`;
  const temporarySandboxName = createProviderName(
    "eve-sbx-tpl-tmp",
    `${input.context.templateName}:${randomUUID()}`,
  );

  await removeSnapshotIfExists(module, snapshotName);
  await rm(temporaryTemplateRootPath, { force: true, recursive: true });
  await mkdir(temporaryTemplateRootPath, { recursive: true });

  let templateOptions = input.options;
  if (input.context.dockerfile !== undefined) {
    const cli = createDockerCli();
    await assertDockerDaemonAvailable(cli);
    const imageReference = dockerfileImageReference({
      dockerfile: input.context.dockerfile,
      templateKey: input.context.templateName,
    });
    input.context.log?.(`building sandbox Dockerfile "${input.context.dockerfile.path}"`);
    await buildSandboxDockerfile({
      cli,
      dockerfile: input.context.dockerfile,
      imageReference,
    });
    input.context.log?.("publishing Dockerfile image for microsandbox");
    const publishedImage = await publishDockerImageForMicrosandbox({ cli, imageReference });
    templateOptions = { ...input.options, image: publishedImage, pullPolicy: "always" };
  }

  const resourceSource = input.context.resources.source;
  const resourcesPath =
    resourceSource.kind === "materialized"
      ? await prepareImmutableResources({
          appRoot: input.context.appRoot,
          provider: input.providerName,
          resourcesKey: resourceSource.key,
          sourcePath: resourceSource.path,
        })
      : undefined;
  input.context.log?.(`creating template VM from image "${templateOptions.image}"`);
  const templateSandbox = await createPreparedMicrosandbox({
    log: input.context.log,
    module,
    name: temporarySandboxName,
    networkPolicy: "allow-all",
    options: templateOptions,
    resourcesPath,
    sessionKey: input.context.templateName,
    setupBaseRuntime: true,
    tags: undefined,
  });
  const templateSession = buildSandboxSession(
    createMicrosandboxInternalSession(templateSandbox),
    async (policy) => {
      await templateSandbox.setNetworkPolicy(policy);
    },
  );

  try {
    await hydrateSandboxProviderResources({
      log: input.context.log,
      resources: input.context.resources,
      session: templateSession,
    });

    input.context.log?.("running sandbox preparation");
    await input.context.runPreparation(
      createLoggingSandboxSession({ log: input.context.log, session: templateSession }),
    );

    input.context.log?.("snapshotting template VM");
    await templateSandbox.stopAndSnapshot(snapshotName);
    await writeTemplateMetadata(resolveMicrosandboxMetadataPath(temporaryTemplateRootPath), {
      image: input.context.dockerfile === undefined ? undefined : templateOptions.image,
      optionsHash: input.optionsHash,
      snapshotName,
      version: MICROSANDBOX_METADATA_VERSION,
    });

    await mkdir(dirname(templateRootPath), { recursive: true });
    await rm(templateRootPath, { force: true, recursive: true });
    try {
      await rename(temporaryTemplateRootPath, templateRootPath);
    } catch (error) {
      if (await doesPathExist(templateRootPath)) {
        const published = await readTemplateMetadata(metadataPath);
        if (published !== null) {
          return { artifact: microsandboxTemplateArtifact(published), reused: true };
        }
      }
      throw error;
    }
  } finally {
    await templateSandbox.removePersisted();
    await rm(temporaryTemplateRootPath, { force: true, recursive: true }).catch(() => {});
  }

  return {
    artifact: microsandboxTemplateArtifact({
      image: input.context.dockerfile === undefined ? undefined : templateOptions.image,
      optionsHash: input.optionsHash,
      snapshotName,
      version: MICROSANDBOX_METADATA_VERSION,
    }),
    reused: false,
  };
}

export async function createMicrosandboxHandle(input: {
  readonly providerName: string;
  readonly context: SandboxProviderCreateContext<
    MicrosandboxSandboxRuntimeOptions,
    MicrosandboxSessionMetadata
  >;
  readonly options: ResolvedMicrosandboxOptions;
  readonly optionsHash: string;
  readonly source: SandboxProviderSource<MicrosandboxPreparedArtifact>;
}): Promise<SandboxProviderHandle<MicrosandboxSessionMetadata>> {
  const cacheDirectory = resolveSandboxCacheDirectory(input.context.appRoot);
  const preparedTemplate =
    input.source.kind === "base"
      ? undefined
      : requirePreparedMicrosandboxTemplate(
          input.source.artifact,
          input.source.templateName,
          input.providerName,
        );
  const existingMetadata =
    input.context.session.kind === "restore" ? input.context.session.metadata : null;
  const image = resolveMicrosandboxImage(existingMetadata, preparedTemplate, input.options);
  const options: LiveMicrosandboxOptions = {
    ...input.options,
    ...image,
    networkPolicy: input.context.options.networkPolicy,
  };
  const module = await loadMicrosandboxModule({
    appRoot: input.context.appRoot,
    options,
  });
  const sessionRootPath = resolveMicrosandboxSessionRootPath(
    cacheDirectory,
    input.context.session.name,
  );
  const activeSessionKey = createActiveMicrosandboxSessionKey(sessionRootPath, input.optionsHash);
  const activeHandle = activeMicrosandboxSessionHandles.get(activeSessionKey);
  if (activeHandle !== undefined) {
    return activeHandle;
  }

  const metadataPath = resolveMicrosandboxMetadataPath(sessionRootPath);
  const sessionTags = withDevelopmentSandboxMetadataPathTag(input.context.tags, metadataPath);

  if (
    existingMetadata?.optionsHash === input.optionsHash &&
    ((await sandboxExists(module, existingMetadata.sandboxName)) ||
      (existingMetadata.stateSnapshotName !== undefined &&
        (await snapshotExists(module, existingMetadata.stateSnapshotName))))
  ) {
    const sandbox = await connectMicrosandbox({
      metadata: existingMetadata,
      metadataPath,
      module,
      options,
      sessionKey: input.context.session.name,
      tags: sessionTags,
    });
    if (sandbox !== null) {
      return cacheHandle(
        activeSessionKey,
        createHandle(sandbox, input.optionsHash, () => {
          activeMicrosandboxSessionHandles.delete(activeSessionKey);
        }),
      );
    }
  }

  let snapshotName: string | undefined;
  if (preparedTemplate !== undefined && input.source.kind === "prepared") {
    if (
      preparedTemplate.optionsHash !== input.optionsHash ||
      !(await snapshotExists(module, preparedTemplate.snapshotName))
    ) {
      throw new SandboxTemplateNotProvisionedError({
        providerName: input.providerName,
        templateKey: input.source.templateName,
      });
    }

    snapshotName = preparedTemplate.snapshotName;
  }

  const sandboxName = createProviderName(
    "eve-sbx-ses",
    `${input.context.session.name}:${randomUUID()}`,
  );
  let sandbox: MicrosandboxVm;
  try {
    sandbox = await createPreparedMicrosandbox({
      fromSnapshot: snapshotName,
      module,
      name: sandboxName,
      networkPolicy: options.networkPolicy,
      options,
      resourcesPath: resolveProviderResourcesPath(
        input.context.resources,
        input.context.appRoot,
        input.providerName,
      ),
      sessionKey: input.context.session.name,
      setupBaseRuntime: snapshotName === undefined,
      tags: sessionTags,
    });
  } catch (error) {
    if (
      snapshotName !== undefined &&
      input.source.kind === "prepared" &&
      isMicrosandboxNotFoundError(error)
    ) {
      throw new SandboxTemplateNotProvisionedError({
        providerName: input.providerName,
        templateKey: input.source.templateName,
      });
    }
    throw error;
  }

  await sandbox.writeMetadata(metadataPath, input.optionsHash);
  return cacheHandle(
    activeSessionKey,
    createHandle(sandbox, input.optionsHash, () => {
      activeMicrosandboxSessionHandles.delete(activeSessionKey);
    }),
  );
}

function resolveMicrosandboxImage(
  session: Readonly<MicrosandboxSessionMetadata> | null,
  template: MicrosandboxTemplateMetadata | undefined,
  defaults: ResolvedMicrosandboxOptions,
): Pick<ResolvedMicrosandboxOptions, "image" | "pullPolicy"> {
  if (session?.image !== undefined) {
    return { image: session.image, pullPolicy: "always" };
  }
  if (template?.image !== undefined) {
    return { image: template.image, pullPolicy: "always" };
  }
  return { image: defaults.image, pullPolicy: defaults.pullPolicy };
}

function microsandboxTemplateArtifact(
  metadata: MicrosandboxTemplateMetadata,
): MicrosandboxPreparedArtifact {
  return {
    image: metadata.image ?? null,
    optionsHash: metadata.optionsHash,
    snapshotName: metadata.snapshotName,
    version: metadata.version,
  };
}

function requirePreparedMicrosandboxTemplate(
  artifact: SandboxPreparedArtifact,
  templateKey: string,
  providerName: string,
): MicrosandboxTemplateMetadata {
  if (
    !isSandboxPreparedArtifactRecord(artifact) ||
    artifact.version !== MICROSANDBOX_METADATA_VERSION ||
    typeof artifact.optionsHash !== "string" ||
    typeof artifact.snapshotName !== "string"
  ) {
    throw new SandboxTemplateNotProvisionedError({ providerName, templateKey });
  }
  return {
    image: typeof artifact.image === "string" ? artifact.image : undefined,
    optionsHash: artifact.optionsHash,
    snapshotName: artifact.snapshotName,
    version: MICROSANDBOX_METADATA_VERSION,
  };
}

function createHandle(
  sandbox: MicrosandboxVm,
  optionsHash: string,
  onShutdown?: () => void,
): SandboxProviderHandle<MicrosandboxSessionMetadata> {
  const session = buildSandboxSession(
    createMicrosandboxInternalSession(sandbox),
    async (policy) => {
      await sandbox.setNetworkPolicy(policy);
    },
  );
  return {
    captureMetadata: async () => await sandbox.captureState(optionsHash),
    sandbox: session,
    async delete() {
      await sandbox.shutdown();
      await sandbox.removePersisted();
      onShutdown?.();
    },
    async stop() {
      await sandbox.stop();
      onShutdown?.();
    },
    async shutdown() {
      onShutdown?.();
      await sandbox.shutdown();
    },
  };
}

function resolveProviderResourcesPath(
  resources: SandboxProviderResources,
  appRoot: string,
  provider: string,
): string | undefined {
  const source = resources.source;
  return source.kind === "none"
    ? undefined
    : resolveImmutableResourcesPath({ appRoot, provider, resourcesKey: source.key });
}

function createMicrosandboxInternalSession(sandbox: MicrosandboxVm): InternalSandboxSession {
  return createFileBackedInternalSandboxSession({ id: sandbox.id, sandbox });
}

function createActiveMicrosandboxSessionKey(sessionRootPath: string, optionsHash: string): string {
  return `${sessionRootPath}\0${optionsHash}`;
}

function cacheHandle(
  key: string,
  handle: SandboxProviderHandle<MicrosandboxSessionMetadata>,
): SandboxProviderHandle<MicrosandboxSessionMetadata> {
  activeMicrosandboxSessionHandles.set(key, handle);
  return handle;
}

export function clearActiveMicrosandboxSessionHandlesForTest(): void {
  activeMicrosandboxSessionHandles.clear();
}
