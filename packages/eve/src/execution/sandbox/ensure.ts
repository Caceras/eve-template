import { contextStorage } from "#context/container.js";
import {
  buildCallbackContext,
  withRuntimeSandboxLifecycle,
} from "#context/build-callback-context.js";
import { trackActiveSandboxHandle } from "#execution/sandbox/active-handles.js";
import { isEveDevEnvironment } from "#internal/application/dev-environment.js";
import {
  getRuntimeCompiledArtifactsSandboxAppRoot,
  type RuntimeCompiledArtifactsSource,
} from "#runtime/compiled-artifacts-source.js";
import { createRuntimeSandboxKeys } from "#runtime/sandbox/keys.js";
import type { RuntimeSandboxRegistry } from "#runtime/sandbox/registry.js";
import { createRuntimeSandboxTemplatePlan } from "#runtime/sandbox/template-plan.js";
import { loadSandboxPreparedArtifact } from "#runtime/sandbox/prepared-artifacts.js";
import type { SandboxAccess, SandboxSessionState, SandboxState } from "#sandbox/state.js";
import {
  getSandboxEnvironmentConfigurationHash,
  getSandboxEnvironmentRuntime,
  runWithSandboxConstructorRuntime,
} from "#shared/sandbox-environment.js";
import {
  createSandboxProviderResources,
  type SandboxDeleteOptions,
  type SandboxProviderHandle,
  type SandboxProviderMetadata,
  type SandboxProviderSource,
  type SandboxProviderRuntime,
  type SandboxProviderTags,
} from "#shared/sandbox-provider.js";
import type { RuntimeSandboxSession } from "#shared/sandbox-session.js";
import { SandboxTemplateNotProvisionedError } from "#shared/sandbox-template-error.js";

export interface EnsureSandboxAccessInput {
  readonly compiledArtifactsSource: RuntimeCompiledArtifactsSource;
  readonly nodeId: string;
  readonly ownsSandbox?: boolean;
  readonly registry: RuntimeSandboxRegistry;
  readonly sessionId: string;
  readonly state: SandboxState | null;
  readonly tags?: SandboxProviderTags;
}

type RuntimeProviderHandle = SandboxProviderHandle<SandboxProviderMetadata>;

interface OpenedSandbox {
  readonly configurationHash: string;
  readonly handle: RuntimeProviderHandle;
  readonly providerName: string;
  readonly sandbox: RuntimeSandboxSession;
  readonly sessionKey: string;
}

export async function ensureSandboxAccess(input: EnsureSandboxAccessInput): Promise<SandboxAccess> {
  let initialized = input.state?.initialized ?? false;
  let persisted: SandboxSessionState | null = input.state?.session ?? null;
  let opened: OpenedSandbox | undefined;
  let opening: Promise<RuntimeProviderHandle> | undefined;
  let requiring: Promise<RuntimeProviderHandle> | undefined;
  const appRoot =
    getRuntimeCompiledArtifactsSandboxAppRoot(input.compiledArtifactsSource) ?? process.cwd();
  const registered = input.registry.sandbox;

  if (registered === null) {
    return {
      async captureState() {
        return { initialized, session: persisted };
      },
      async get() {
        return null;
      },
      async stop() {},
    };
  }

  async function open(
    provider: SandboxProviderRuntime,
    options: object,
    configurationHash: string,
    environment: object,
    environmentConfigurationHash: string,
  ): Promise<RuntimeSandboxSession> {
    if (opening !== undefined) throw new Error("A sandbox definition can create only one sandbox.");
    const inherited = registered.inheritance;
    const definition = inherited?.definition ?? registered.definition;
    if (definition.kind !== "independent")
      throw new Error(`Sandbox "${definition.logicalPath}" has no environment.`);
    if (environment !== definition.environment)
      throw new Error(`Sandbox "${definition.logicalPath}" selected a different environment.`);
    if (provider !== getSandboxEnvironmentRuntime(definition.environment))
      throw new Error(`Sandbox "${definition.logicalPath}" selected a different provider.`);

    const workspaceResourceRoot =
      inherited?.workspaceResourceRoot ?? registered.workspaceResourceRoot;
    const keys = await createRuntimeSandboxKeys({
      compiledArtifactsSource: input.compiledArtifactsSource,
      configurationHash,
      environmentConfigurationHash,
      nodeId: inherited?.nodeId ?? input.nodeId,
      providerName: provider.providerName,
      sessionId: input.sessionId,
      sourceId: definition.sourceId,
      templatePlan: createRuntimeSandboxTemplatePlan({ definition, workspaceResourceRoot }),
    });

    const existing =
      persisted?.providerName === provider.providerName && persisted.sessionKey === keys.sessionKey
        ? persisted
        : null;
    const sandboxName = keys.sessionKey;
    const create = async () => {
      const source = await resolveProviderSource({
        compiledArtifactsSource: input.compiledArtifactsSource,
        providerName: provider.providerName,
        templateName: keys.templateKey,
      });
      return await provider.implementation.open(
        {
          appRoot,
          options,
          resources: createSandboxProviderResources({
            resourcesKey: workspaceResourceRoot.contentHash,
          }),
          instance:
            existing === null
              ? { kind: "create", name: sandboxName }
              : { kind: "restore", metadata: existing.metadata, name: sandboxName },
          tags: input.tags,
        },
        source,
      );
    };

    opening = withDevelopmentSandboxProgress(
      `eve: opening sandbox session "${formatNodeLabel(input.nodeId)}" on provider "${provider.providerName}"...`,
      `eve: opening sandbox session "${formatNodeLabel(input.nodeId)}" on provider "${provider.providerName}"`,
      create,
    ).catch((error: unknown) => {
      opening = undefined;
      throw error;
    });

    const openedHandle = await opening;
    initialized = true;
    trackActiveSandboxHandle({
      handle: openedHandle,
      providerName: provider.providerName,
      sessionKey: sandboxName,
    });

    const sandbox = withRuntimeSandboxLifecycle(
      openedHandle.sandbox,
      (deleteOptions?: SandboxDeleteOptions) => openedHandle.delete(deleteOptions),
      () => openedHandle.stop(),
    );
    opened = {
      configurationHash,
      handle: openedHandle,
      providerName: provider.providerName,
      sandbox,
      sessionKey: sandboxName,
    };
    return sandbox;
  }

  function requireHandle(): Promise<RuntimeProviderHandle> {
    if (opened !== undefined) return Promise.resolve(opened.handle);
    requiring ??= resolveHandle().catch((error: unknown) => {
      requiring = undefined;
      throw error;
    });
    return requiring;
  }

  async function resolveHandle(): Promise<RuntimeProviderHandle> {
    const inherited = registered.inheritance;
    const definition = inherited?.definition ?? registered.definition;
    if (definition.kind !== "independent") {
      throw new Error(`Sandbox "${definition.logicalPath}" has no resolved parent.`);
    }

    if (inherited !== undefined) {
      const configurationHash = getSandboxEnvironmentConfigurationHash(definition.environment);
      await open(
        getSandboxEnvironmentRuntime(definition.environment),
        {},
        configurationHash,
        definition.environment,
        configurationHash,
      );
    } else {
      const session =
        contextStorage.getStore() === undefined
          ? {
              auth: { current: null, initiator: null },
              id: input.sessionId,
              turn: { id: "sandbox-initialization", sequence: 0 },
            }
          : buildCallbackContext().session;
      try {
        const selected = await runWithSandboxConstructorRuntime(
          {
            open: ({
              configurationHash,
              environment,
              environmentConfigurationHash,
              options,
              provider,
            }) =>
              open(provider, options, configurationHash, environment, environmentConfigurationHash),
          },
          async () => definition.selector({ session }),
        );
        if (opened === undefined || selected !== opened.sandbox) {
          throw new Error(
            `Sandbox "${definition.logicalPath}" must return the sandbox it creates.`,
          );
        }
      } catch (error) {
        opened = undefined;
        initialized = false;
        opening = undefined;
        throw error;
      }
    }

    if (opened === undefined) {
      throw new Error(`Sandbox "${definition.logicalPath}" did not create a provider handle.`);
    }
    return opened.handle;
  }

  return {
    async captureState() {
      if (opening !== undefined) await opening;
      if (opened !== undefined) {
        persisted = {
          configurationHash: opened.configurationHash,
          metadata: await opened.handle.captureMetadata(),
          providerName: opened.providerName,
          sessionKey: opened.sessionKey,
        };
      }
      return { initialized, session: persisted };
    },
    async delete(deleteOptions) {
      if (input.ownsSandbox === false)
        throw new Error("Only the owning session can delete this sandbox.");
      const current = await requireHandle();
      await current.delete(deleteOptions);
      opened = undefined;
      initialized = false;
      opening = undefined;
      persisted = null;
      requiring = undefined;
    },
    async get() {
      return (await requireHandle()).sandbox;
    },
    async stop() {
      const current = await requireHandle();
      await current.stop();
    },
  };
}

async function resolveProviderSource(input: {
  readonly compiledArtifactsSource: RuntimeCompiledArtifactsSource;
  readonly providerName: string;
  readonly templateName: string | null;
}): Promise<SandboxProviderSource> {
  if (input.templateName === null) return { kind: "base" };
  const artifact = await loadSandboxPreparedArtifact({
    compiledArtifactsSource: input.compiledArtifactsSource,
    providerName: input.providerName,
    templateName: input.templateName,
  });
  if (artifact === undefined) {
    throw new SandboxTemplateNotProvisionedError({
      providerName: input.providerName,
      templateKey: input.templateName,
    });
  }
  return { artifact, kind: "prepared", templateName: input.templateName };
}

function logDevelopmentSandbox(message: string): void {
  if (isEveDevEnvironment()) console.log(message);
}

async function withDevelopmentSandboxProgress<T>(
  startMessage: string,
  progressMessage: string,
  callback: () => Promise<T>,
): Promise<T> {
  logDevelopmentSandbox(startMessage);
  if (!isEveDevEnvironment()) return await callback();
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    logDevelopmentSandbox(`${progressMessage} (${elapsedSeconds}s elapsed)...`);
  }, 5_000);
  timer.unref?.();
  try {
    return await callback();
  } finally {
    clearInterval(timer);
  }
}

function formatNodeLabel(nodeId: string): string {
  return nodeId === "__root__" ? "root" : nodeId;
}
