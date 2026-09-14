import { readdir } from "node:fs/promises";
import { basename, join } from "node:path";

import pc from "#compiled/picocolors/index.js";

import { assertValidPublicAgentName } from "#internal/agent-name.js";
import { findEveProjectContext } from "#internal/project-context.js";
import type { AgentReasoningDefinition } from "#shared/agent-definition.js";
import { DEFAULT_AGENT_MODEL_ID } from "#shared/default-agent-model.js";
import { createPrompter } from "#setup/prompter.js";
import { agentTemplateFiles } from "#setup/scaffold/create/project.js";
import { writeTextFile } from "#setup/scaffold/files.js";
import { WizardCancelledError } from "#setup/step.js";

import { prepareBaseAgentMigration } from "./base-agent.js";
import { prepareWebChatMigration, type WebChatMigration } from "./web-chat.js";
import type { InitCliLogger } from "../init-agent-workspace.js";
import { hasInteractiveTerminal } from "../preconditions.js";

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

async function assertSupportedHost(
  root: string,
  oldName: string,
): Promise<WebChatMigration | undefined> {
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

  const webChat = await prepareWebChatMigration(root, oldName);
  if (webChat !== undefined) return webChat;
  if (
    [...entries].some((entry) => entry.startsWith("next.config.")) ||
    entries.has("app") ||
    entries.has("pages")
  ) {
    throw new Error(
      'Cannot convert this standalone eve project because it has a custom Next.js app. Move agent/ and evals/ into agents/<name>/, then configure withEve({ eveRoot: "./agents/<name>" }) manually.',
    );
  }
  return undefined;
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

  const [baseAgent, webChat] = await Promise.all([
    prepareBaseAgentMigration(root, oldName),
    assertSupportedHost(root, oldName),
  ]);
  if (input.options.model !== undefined && input.validateModel !== undefined) {
    const rejection = await input.validateModel(root, input.options.model);
    if (rejection !== null) throw new Error(rejection);
  }
  if (input.options.yes !== true) await confirmMigration(oldName, newName, dependencies);

  if (webChat !== undefined) await webChat.apply();
  await baseAgent.apply();
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
