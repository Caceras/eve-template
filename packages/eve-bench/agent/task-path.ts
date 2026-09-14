import { resolve } from "node:path";

export function taskRoot(): string {
  const root = process.env.EVE_BENCH_TASK_WORKDIR;
  if (root === undefined || root.length === 0) {
    throw new Error("EVE_BENCH_TASK_WORKDIR must be set by the eve-bench harness.");
  }
  return resolve(root);
}

export function resolveTaskPath(path = "."): string {
  const root = taskRoot();
  const target = resolve(root, path);
  if (target !== root && !target.startsWith(`${root}/`)) {
    throw new Error("Task paths must stay inside the task working directory.");
  }
  return target;
}
