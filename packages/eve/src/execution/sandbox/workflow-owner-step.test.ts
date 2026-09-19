import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareWorkflowSandboxStep } from "#execution/sandbox/workflow-owner-step.js";
import { createTestSessionState } from "#internal/testing/session-state.js";
import type { WorkflowToolRunRequestMessage } from "#execution/tools/workflow/messages.js";

const mocks = vi.hoisted(() => ({
  deserialize: vi.fn(),
  run: vi.fn(),
  task: vi.fn(),
  view: vi.fn(),
}));
vi.mock("#context/serialize.js", () => ({ deserializeContext: mocks.deserialize }));
vi.mock("#harness/workflow-tool-runs.js", () => ({ findWorkflowToolRun: mocks.run }));
vi.mock("#tasks/session-index.js", () => ({ findSessionTaskEntry: mocks.task }));
vi.mock("#execution/tasks/parent/run-parent.js", () => ({ readLatestTaskView: mocks.view }));

const message: WorkflowToolRunRequestMessage = {
  from: {
    callId: "call-1",
    execution: "blocking",
    input: {},
    runId: "run-1",
    sequence: 0,
    stepIndex: 0,
    toolName: "probe",
    turnId: "turn-1",
  },
  replyTo: "eve.sandbox.step-1",
  request: { kind: "sandbox-request" },
};

describe("workflow sandbox owner admission", () => {
  beforeEach(() => vi.resetAllMocks());
  it.each([
    undefined,
    { runId: "other-run", toolName: "probe" },
    { runId: "run-1", toolName: "other-tool" },
  ])("does not initialize or reply for an unowned blocking run %j", async (recorded) => {
    mocks.run.mockReturnValue(recorded);
    const sessionState = createTestSessionState();
    expect(
      await prepareWorkflowSandboxStep({ message, sessionState, serializedContext: {} }),
    ).toEqual({ sessionState });
    expect(mocks.deserialize).not.toHaveBeenCalled();
  });
  it.each([
    { taskRunId: "other-run", metadata: { name: "probe" }, createdByTurnId: "turn-1" },
    { taskRunId: "run-1", metadata: { name: "probe" }, createdByTurnId: "other-turn" },
    { taskRunId: "run-1", metadata: { name: "probe" }, createdByTurnId: "turn-1" },
  ])("does not initialize or reply for an unowned or terminal background run %j", async (entry) => {
    mocks.task.mockReturnValue(entry);
    mocks.view.mockResolvedValue({ status: "cancelled" });
    const sessionState = createTestSessionState();
    expect(
      await prepareWorkflowSandboxStep({
        message,
        taskId: "task-1",
        sessionState,
        serializedContext: {},
      }),
    ).toEqual({ sessionState });
    expect(mocks.deserialize).not.toHaveBeenCalled();
  });
});
