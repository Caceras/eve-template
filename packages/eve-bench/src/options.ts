import { access, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readCohort, readDatasetLock, type DatasetLock } from "./core/dataset.ts";
import type { Harness } from "./core/harness.ts";
import { assertSafeId } from "./core/id.ts";
import type { Task } from "./core/task.ts";
import { createEveHarness } from "./harnesses/eve/index.ts";
import { createOracleHarness } from "./harnesses/oracle.ts";
import { createE0Harness } from "./harnesses/e0/index.ts";
import { createCliHarness } from "./harnesses/cli/index.ts";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const paths = {
  packageRoot,
  datasetsRoot: join(packageRoot, "datasets"),
  generatedRoot: join(packageRoot, ".generated"),
} as const;

export interface TaskSelection {
  readonly lock: DatasetLock;
  readonly tasks: readonly string[];
  readonly taskDirs: readonly string[];
}

export async function selectTasks(input: {
  cohort?: string;
  dataset?: string;
  task?: readonly string[];
  taskDir?: readonly string[];
}): Promise<TaskSelection> {
  const localTaskDirs = input.taskDir?.map((dir) => resolve(dir)) ?? [];
  if (localTaskDirs.length > 0 && !input.cohort && !input.dataset && !input.task?.length) {
    return {
      lock: { name: "local", version: "0", commit: "", gitUrl: "", tasks: [] },
      tasks: [],
      taskDirs: localTaskDirs,
    };
  }

  if (input.cohort) {
    const cohortName = assertSafeId(input.cohort, "job");
    const cohort = await readCohort(join(paths.datasetsRoot, "cohorts", `${cohortName}.json`));
    const entry = await lock(cohort.dataset);
    const tasks = input.task?.length
      ? cohort.tasks.filter((task) => input.task!.includes(task))
      : cohort.tasks;
    assertSelectedTasks(input.task, tasks, cohort.dataset);
    return { lock: entry, tasks, taskDirs: localTaskDirs };
  }

  const entry = await lock(input.dataset ?? (await defaultDataset()));
  const tasks = input.task?.length
    ? entry.tasks.filter((task) => input.task!.includes(task))
    : entry.tasks;
  assertSelectedTasks(input.task, tasks, `${entry.name}@${entry.version}`);
  return { lock: entry, tasks, taskDirs: localTaskDirs };
}

export function jobDir(name: string): string {
  return join(paths.generatedRoot, "jobs", assertSafeId(name, "job"));
}

export async function lock(name: string): Promise<DatasetLock> {
  return readDatasetLock(join(paths.datasetsRoot, `${assertSafeId(name, "job")}.json`));
}

export async function allLocks(): Promise<DatasetLock[]> {
  const files = (await readdir(paths.datasetsRoot)).filter((file) => file.endsWith(".json"));
  return Promise.all(files.map((file) => readDatasetLock(join(paths.datasetsRoot, file))));
}

export function defaultJobName(label: string): string {
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-").slice(0, 19);
  return `${stamp}-${label.replaceAll(/[^A-Za-z0-9._-]/gu, "_")}`;
}

export function selectHarness(
  name: string,
  eve: string,
  options: { agent?: string; version?: string; baseUrl?: string; reasoning?: string } = {},
): Harness {
  if (name !== "e0" && options.agent) throw new Error("--agent is only supported by --harness e0");
  if (name === "e0")
    return createE0Harness({ agent: options.agent ?? "", reasoning: options.reasoning });
  if (name === "pi" || name === "opencode" || name === "codex" || name === "hermes") {
    return createCliHarness(name, {
      version: options.version ?? "",
      baseUrl: options.baseUrl,
      reasoning: options.reasoning,
    });
  }
  if (options.version || options.baseUrl || options.reasoning)
    throw new Error("--version, --base-url and --reasoning require a supporting harness");
  if (name === "oracle") return createOracleHarness();
  if (name === "eve") {
    return createEveHarness(
      eve === "local" ? { kind: "local" } : { kind: "release", version: eve },
    );
  }
  throw new Error(`unknown harness: ${name}`);
}

export async function selectNativeBuild(tasks: readonly Task[], enabled: boolean): Promise<Task[]> {
  if (!enabled) return [...tasks];
  return Promise.all(
    tasks.map(async (task) => {
      try {
        await access(join(task.environment.dockerfileDir, "Dockerfile"));
      } catch {
        throw new Error(`Task ${task.name} has no Dockerfile for --native-build`);
      }
      return {
        ...task,
        environment: { ...task.environment, dockerImage: undefined },
      };
    }),
  );
}

export function forwardedEnv(names: readonly string[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of names) {
    const value = process.env[key];
    if (value) env[key] = value;
  }
  return env;
}

function assertSelectedTasks(
  requested: readonly string[] | undefined,
  selected: readonly string[],
  source: string,
): void {
  if (!requested?.length || selected.length === requested.length) return;
  const missing = requested.filter((task) => !selected.includes(task));
  throw new Error(`tasks not in ${source}: ${missing.join(", ")}`);
}

async function defaultDataset(): Promise<string> {
  const locks = await allLocks();
  if (locks.length !== 1) {
    throw new Error("pass --dataset or --cohort; multiple datasets are available");
  }
  return `${locks[0]!.name}-${locks[0]!.version}`;
}
