import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
  applyEdits as applyJsoncEdits,
  modify as modifyJsonc,
  parse as parseJsonc,
  type ParseError,
} from "#compiled/jsonc-parser/index.js";

const JSONC_FORMATTING = { eol: "\n", insertSpaces: true, tabSize: 2 } as const;
const ROOT_AGENT_INCLUDE = "agent/**/*.ts";
const ROOT_EVAL_INCLUDE = "evals/**/*.ts";
const WORKSPACE_INCLUDE = "agents/**/*.ts";

interface JsonObject {
  [key: string]: unknown;
}

export interface BaseAgentMigration {
  apply(): Promise<void>;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsoncObject(path: string, source: string): JsonObject {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(source, errors, { allowTrailingComma: true });
  if (errors.length > 0 || !isJsonObject(parsed)) {
    throw new Error(
      `Cannot convert this standalone eve project because ${path} is not a valid JSON object.`,
    );
  }
  return parsed;
}

function setJsoncValue(source: string, path: readonly string[], value: unknown): string {
  return applyJsoncEdits(
    source,
    modifyJsonc(source, [...path], value, { formattingOptions: JSONC_FORMATTING }),
  );
}

function updatedTsconfig(path: string, source: string): string {
  const tsconfig = parseJsoncObject(path, source);
  if (tsconfig.include === undefined) return source;
  if (
    !Array.isArray(tsconfig.include) ||
    !tsconfig.include.every((value) => typeof value === "string")
  ) {
    throw new Error(
      `Cannot convert this standalone eve project because ${path} has a non-string include list. Update its TypeScript paths manually.`,
    );
  }
  if (
    !tsconfig.include.includes(ROOT_AGENT_INCLUDE) &&
    !tsconfig.include.includes(ROOT_EVAL_INCLUDE)
  ) {
    return source;
  }
  const include = tsconfig.include.filter(
    (value) => value !== ROOT_AGENT_INCLUDE && value !== ROOT_EVAL_INCLUDE,
  );
  if (!include.includes(WORKSPACE_INCLUDE)) include.push(WORKSPACE_INCLUDE);
  return setJsoncValue(source, ["include"], include);
}

function updatedPackage(path: string, source: string, oldName: string): string {
  const manifest = parseJsoncObject(path, source);
  if (manifest.imports === undefined) return source;
  if (!isJsonObject(manifest.imports)) {
    throw new Error(
      `Cannot convert this standalone eve project because ${path} has a non-object imports field. Update its package imports manually.`,
    );
  }

  const updates: Array<readonly [string, string]> = [];
  const aliases = [
    ["#*", "./agent/*", `./agents/${oldName}/agent/*`],
    ["#evals/*", "./evals/*", `./agents/${oldName}/evals/*`],
  ] as const;
  for (const [key, expected, replacement] of aliases) {
    const value = manifest.imports[key];
    if (value === undefined) continue;
    if (value !== expected) {
      throw new Error(
        `Cannot convert this standalone eve project because ${path} defines a custom ${JSON.stringify(key)} import. Update that import manually after moving the agent.`,
      );
    }
    updates.push([key, replacement]);
  }

  return updates.reduce(
    (updated, [key, value]) => setJsoncValue(updated, ["imports", key], value),
    source,
  );
}

async function moveIfPresent(root: string, oldName: string, path: string): Promise<void> {
  try {
    await rename(join(root, path), join(root, "agents", oldName, path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/** Plans the root-agent move and the configuration edits required to keep it typecheckable. */
export async function prepareBaseAgentMigration(
  root: string,
  oldName: string,
): Promise<BaseAgentMigration> {
  const agentPath = join(root, "agent");
  if ((await stat(agentPath).catch(() => undefined))?.isDirectory() !== true) {
    throw new Error(
      "Cannot convert this standalone eve project because its root agent is not in agent/. Move the agent into agents/<name>/ manually.",
    );
  }

  const packagePath = join(root, "package.json");
  const tsconfigPath = join(root, "tsconfig.json");
  const [packageSource, tsconfigSource] = await Promise.all([
    readFile(packagePath, "utf8"),
    readFile(tsconfigPath, "utf8"),
  ]);
  const packageUpdated = updatedPackage(packagePath, packageSource, oldName);
  const tsconfigUpdated = updatedTsconfig(tsconfigPath, tsconfigSource);

  return {
    async apply() {
      // Configuration writes precede renames so a write failure cannot strand the root agent.
      await Promise.all([
        packageUpdated === packageSource
          ? undefined
          : writeFile(packagePath, packageUpdated, "utf8"),
        tsconfigUpdated === tsconfigSource
          ? undefined
          : writeFile(tsconfigPath, tsconfigUpdated, "utf8"),
      ]);
      await mkdir(join(root, "agents", oldName), { recursive: true });
      await moveIfPresent(root, oldName, "agent");
      await moveIfPresent(root, oldName, "evals");
    },
  };
}
