import { describe, expect, it } from "vitest";
import { createTestRuntime } from "#internal/testing/app-harness.js";
import { getWorld, start } from "#internal/workflow/runtime.js";
import { taskRunWorkflow } from "#execution/tasks/child/workflow.js";
import { workflowEntry } from "#execution/session/entry.js";
import { readWorkflowStarted } from "#execution/workflow-started.js";
import { createBundledRuntimeCompiledArtifactsSource } from "#runtime/compiled-artifacts-source.js";

describe("workflow startup acknowledgement", () => {
  it("returns one task owner to concurrent candidates", async () => {
    const runtime = await createTestRuntime({ agent: { name: "task-startup" } });
    await runtime.run(async () => {
      const input = {
        initialView: {
          metadata: { kind: "tool", name: "worker" },
          status: "working",
          taskId: "task",
        },
        parentContinuationToken: "parent",
        taskInboxToken: `task:${crypto.randomUUID()}`,
      } as const;
      const runs = await Promise.all([
        start(taskRunWorkflow, [input]),
        start(taskRunWorkflow, [input]),
      ]);
      try {
        const owners = await Promise.all(runs.map((run) => readWorkflowStarted(run.runId)));
        expect(owners[0]).toEqual(owners[1]);
        expect(runs.map((run) => run.runId)).toContain(owners[0]!.runId);
      } finally {
        await Promise.all(
          runs.map(async (run) => {
            if (["pending", "running"].includes(await run.status)) await run.cancel();
          }),
        );
      }
    });
  });

  it.each([
    {
      mode: "with an initial message",
      input: { message: "Alice is checking that her conversation is ready." },
    },
    { mode: "before a prewarmed session receives its first message", input: {} },
  ])("returns the winning public session $mode", async ({ input: sessionInput }) => {
    const runtime = await createTestRuntime({ agent: { name: "session-startup" } });
    await runtime.run(async () => {
      const input = {
        acknowledgeStartup: true,
        kind: "initial",
        input: sessionInput,
        ownerDeploymentId: await (await getWorld()).getDeploymentId(),
        serializedContext: {
          "eve.auth": null,
          "eve.bundle": { source: createBundledRuntimeCompiledArtifactsSource() },
          "eve.channel": { kind: "http", state: {} },
          "eve.continuationToken": `startup:${crypto.randomUUID()}`,
          "eve.mode": "conversation",
        },
      } as const;
      const runs = await Promise.all([
        start(workflowEntry, [input]),
        start(workflowEntry, [input]),
      ]);
      try {
        const owners = await Promise.all(runs.map((run) => readWorkflowStarted(run.runId)));
        expect(owners[0]).toEqual(owners[1]);
        expect(owners[0]!.sessionId).toBe(owners[0]!.runId);
        expect(runs.map((run) => run.runId)).toContain(owners[0]!.sessionId);
      } finally {
        await Promise.all(
          runs.map(async (run) => {
            if (["pending", "running"].includes(await run.status)) await run.cancel();
          }),
        );
      }
    });
  });
});
