import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { Task } from "./core/task.ts";
import { jobDir, lock, selectNativeBuild, selectTasks } from "./options.ts";

function task(dir: string): Task {
  return {
    name: "example",
    dir,
    instruction: "test",
    agentTimeoutMs: 1,
    verifierTimeoutMs: 1,
    buildTimeoutMs: 1,
    environment: {
      dockerImage: "registry.example/task:pinned",
      dockerfileDir: join(dir, "environment"),
      allowInternet: true,
    },
  };
}

test("job, dataset, and cohort selections reject traversal and missing tasks", async () => {
  assert.throws(() => jobDir("../../outside"), /Docker-safe/);
  await assert.rejects(lock("../outside"), /Docker-safe/);
  await assert.rejects(selectTasks({ cohort: "smoke", task: ["missing-task"] }), /tasks not in/);
});

test("native build replaces a prebuilt image only when a Dockerfile exists", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "eve-bench-native-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(join(dir, "environment"));
  await writeFile(join(dir, "environment/Dockerfile"), "FROM scratch\n");
  const original = task(dir);
  assert.equal(
    (await selectNativeBuild([original], false))[0]?.environment.dockerImage,
    original.environment.dockerImage,
  );
  assert.equal((await selectNativeBuild([original], true))[0]?.environment.dockerImage, undefined);
  await rm(join(dir, "environment/Dockerfile"));
  await assert.rejects(selectNativeBuild([original], true), /has no Dockerfile/);
});
