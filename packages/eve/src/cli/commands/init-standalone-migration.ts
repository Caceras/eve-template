import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import pc from "#compiled/picocolors/index.js";

import { assertValidPublicAgentName } from "#internal/agent-name.js";
import { findEveProjectContext } from "#internal/project-context.js";
import type { AgentReasoningDefinition } from "#shared/agent-definition.js";
import { DEFAULT_AGENT_MODEL_ID } from "#shared/default-agent-model.js";
import { createPrompter } from "#setup/prompter.js";
import { agentTemplateFiles } from "#setup/scaffold/create/project.js";
import {
  WEB_APP_SIGN_IN_WITH_VERCEL_TEMPLATE_FILES,
  WEB_APP_TEMPLATE_FILES,
} from "#setup/scaffold/create/web-template.js";
import { writeTextFile } from "#setup/scaffold/files.js";
import { WizardCancelledError } from "#setup/step.js";

import { hasInteractiveTerminal } from "./preconditions.js";

import type { InitCliLogger } from "./init-agent-workspace.js";

const GENERATED_WEB_CHAT_NEXT_CONFIG =
  'import type { NextConfig } from "next";\nimport { withEve } from "eve/next";\n\nconst nextConfig: NextConfig = {};\n\nexport default withEve(nextConfig);\n';

interface StandaloneMigrationOptions {
  readonly model?: string;
  readonly reasoning?: AgentReasoningDefinition;
  readonly yes?: boolean;
}

export interface StandaloneMigrationDependencies {
  createPrompter: typeof createPrompter;
  findEveProjectContext: typeof findEveProjectContext;
  hasInteractiveTerminal: typeof hasInteractiveTerminal;
}

const defaultDependencies: StandaloneMigrationDependencies = {
  createPrompter,
  findEveProjectContext,
  hasInteractiveTerminal,
};

async function isGeneratedWebChat(root: string): Promise<boolean> {
  try {
    const [config, page] = await Promise.all([
      readFile(join(root, "next.config.ts"), "utf8"),
      readFile(join(root, "app", "page.tsx"), "utf8"),
    ]);
    return (
      config === GENERATED_WEB_CHAT_NEXT_CONFIG &&
      (page === WEB_APP_TEMPLATE_FILES["app/page.tsx"] ||
        page === WEB_APP_SIGN_IN_WITH_VERCEL_TEMPLATE_FILES["app/page.tsx"])
    );
  } catch {
    return false;
  }
}

async function assertCanMigrate(root: string): Promise<"plain" | "web-chat"> {
  const entries = new Set(await readdir(root));
  if (entries.has("agents")) {
    throw new Error(
      "Cannot convert this standalone eve project because agents/ already exists. Complete the migration manually to avoid overwriting an existing workspace.",
    );
  }
  if (entries.has("vercel.ts") || entries.has("vercel.json")) {
    throw new Error(
      "Cannot convert this standalone eve project because it defines a Vercel service graph. Move agent/ and evals/ into agents/<name>/, then update the service graph manually.",
    );
  }
  if (await isGeneratedWebChat(root)) return "web-chat";
  if (
    [...entries].some((entry) => entry.startsWith("next.config.")) ||
    entries.has("app") ||
    entries.has("pages")
  ) {
    throw new Error(
      'Cannot convert this standalone eve project because it has a custom Next.js app. Move agent/ and evals/ into agents/<name>/, then configure withEve({ eveRoot: "./agents/<name>" }) manually.',
    );
  }
  return "plain";
}

async function confirmMigration(
  oldName: string,
  name: string,
  dependencies: StandaloneMigrationDependencies,
): Promise<void> {
  if (!dependencies.hasInteractiveTerminal()) {
    throw new Error(
      "Cannot convert a standalone eve project without an interactive terminal. Re-run `eve init <name> --yes`, or migrate agent/ and evals/ into agents/<name>/ manually.",
    );
  }
  const choice = await dependencies.createPrompter().select<"convert" | "cancel">({
    message: "Convert this eve project to an agents workspace?",
    description: `The existing agent will move to agents/${oldName}/ and ${name} will be added.`,
    options: [
      { value: "convert", label: "Convert and add", accent: "warning" },
      { value: "cancel", label: "Cancel" },
    ],
  });
  if (choice === "cancel") throw new WizardCancelledError();
}

async function moveIfPresent(root: string, oldName: string, path: string): Promise<void> {
  const source = join(root, path);
  try {
    await rename(source, join(root, "agents", oldName, path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function prepareWorkspaceConfiguration(
  root: string,
  oldName: string,
): Promise<{
  packagePath: string;
  packageUpdated: string;
  packageUnchanged: boolean;
  tsconfigPath: string;
  tsconfig: string;
}> {
  const tsconfigPath = join(root, "tsconfig.json");
  const packagePath = join(root, "package.json");
  const [tsconfigSource, packageSource] = await Promise.all([
    readFile(tsconfigPath, "utf8"),
    readFile(packagePath, "utf8"),
  ]);
  const tsconfig = tsconfigSource
    .replace('"agent/**/*.ts"', '"agents/**/*.ts"')
    .replace('"evals/**/*.ts"', '"agents/**/*.ts"');
  if (tsconfig === tsconfigSource && !tsconfigSource.includes('"**/*.ts"')) {
    throw new Error(
      `Cannot convert this standalone eve project because ${tsconfigPath} is not a generated eve TypeScript configuration.`,
    );
  }
  const packageUpdated = packageSource
    .replace(/"#\*"\s*:\s*"\.\/agent\/\*"/u, `"#*": "./agents/${oldName}/agent/*"`)
    .replace(/"#evals\/\*"\s*:\s*"\.\/evals\/\*"/u, `"#evals/*": "./agents/${oldName}/evals/*"`);
  return {
    packagePath,
    packageUpdated,
    packageUnchanged: packageUpdated === packageSource,
    tsconfigPath,
    tsconfig,
  };
}

/** Converts a standalone project only when `eve init <name>` explicitly requests another agent. */
export async function migrateStandaloneProject(input: {
  readonly logger: InitCliLogger;
  readonly options: StandaloneMigrationOptions;
  readonly root: string;
  readonly target: string | undefined;
  readonly validateModel?: (directory: string, model: string) => Promise<string | null>;
  readonly dependencies?: StandaloneMigrationDependencies;
}): Promise<boolean> {
  const dependencies = input.dependencies ?? defaultDependencies;
  if (input.target === undefined || input.target === ".") return false;
  const context = await dependencies.findEveProjectContext(input.root);
  if (context?.kind !== "standalone") return false;
  const root = context.appRoot;

  const newName = input.target;
  const oldName = basename(root);
  try {
    assertValidPublicAgentName(newName, "Agent");
    assertValidPublicAgentName(oldName, "Existing agent");
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Convert this project manually by moving agent/ and evals/ into agents/<name>/.`,
    );
  }
  if (newName === oldName) {
    throw new Error(
      `Cannot add agent ${JSON.stringify(newName)} because it is the existing agent name.`,
    );
  }

  const layout = await assertCanMigrate(root);
  const configuration = await prepareWorkspaceConfiguration(root, oldName);
  if (input.options.model !== undefined && input.validateModel !== undefined) {
    const rejection = await input.validateModel(root, input.options.model);
    if (rejection !== null) throw new Error(rejection);
  }
  if (input.options.yes !== true) await confirmMigration(oldName, newName, dependencies);

  const oldRoot = join(root, "agents", oldName);
  await mkdir(oldRoot, { recursive: true });
  await moveIfPresent(root, oldName, "agent");
  await moveIfPresent(root, oldName, "evals");
  await writeFile(configuration.tsconfigPath, configuration.tsconfig, "utf8");
  if (!configuration.packageUnchanged) {
    await writeFile(configuration.packagePath, configuration.packageUpdated, "utf8");
  }
  if (layout === "web-chat") {
    await writeFile(
      join(root, "next.config.ts"),
      GENERATED_WEB_CHAT_NEXT_CONFIG.replace(
        "withEve(nextConfig)",
        `withEve(nextConfig, { eveRoot: "./agents/${oldName}" })`,
      ),
      "utf8",
    );
  }

  const files = agentTemplateFiles(
    input.options.model ?? DEFAULT_AGENT_MODEL_ID,
    input.options.reasoning,
  );
  await Promise.all(
    Object.entries(files).map(([path, content]) =>
      writeTextFile(join(root, "agents", newName, path), content),
    ),
  );
  input.logger.log(
    `${pc.green("✓")} Converted to an agents workspace and added ${pc.bold(newName)}`,
  );
  input.logger.log(pc.dim("$ eve dev --agent <name>"));
  return true;
}
