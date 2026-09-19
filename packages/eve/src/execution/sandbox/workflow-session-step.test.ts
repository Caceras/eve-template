import { describe, expect, it, vi } from "vitest";
import { openWorkflowSandboxStep } from "#execution/sandbox/workflow-session-step.js";
import { mockSandbox } from "#internal/testing/mocks/mock-sandbox.js";
import type { WorkflowSandboxReferenceData } from "#execution/sandbox/workflow-reference.js";

const mocks = vi.hoisted(() => ({ ensure: vi.fn(), bundle: vi.fn(), request: vi.fn() }));
vi.mock("#execution/sandbox/ensure.js", () => ({ ensureSandboxAccess: mocks.ensure }));
vi.mock("#runtime/sessions/compiled-agent-cache.js", () => ({
  getCompiledRuntimeAgentBundle: mocks.bundle,
}));

vi.mock("#execution/sandbox/workflow-request.js", () => ({
  requestWorkflowSandbox: mocks.request,
}));

describe("workflow sandbox access", () => {
  it("borrows the recorded sandbox, binds cancellation, and forbids lifecycle mutations", async () => {
    const sandbox = mockSandbox();
    const run = vi.spyOn(sandbox.session, "run");
    const stop = vi.fn();
    const remove = vi.fn();
    mocks.ensure.mockResolvedValue({ ...sandbox.access, stop, delete: remove });
    const registry = { sandbox: null };
    mocks.bundle.mockResolvedValue({ graph: { root: { sandboxRegistry: registry } } });
    const reference: WorkflowSandboxReferenceData = {
      compiledArtifactsSource: { kind: "bundled" },
      nodeId: "root",
      sessionId: "parent-session",
      state: { initialized: true, session: null },
    };
    mocks.request.mockResolvedValue(reference);
    const context = {
      owner: { inbox: "owner-inbox" },
      from: {
        callId: "call-1",
        execution: "blocking" as const,
        input: {},
        runId: "run-1",
        sequence: 0,
        stepIndex: 0,
        toolName: "probe",
        turnId: "turn-1",
      },
    };
    const controller = new AbortController();
    const handle = await openWorkflowSandboxStep({ run: context, abortSignal: controller.signal });
    expect(mocks.ensure).toHaveBeenCalledWith({ ...reference, ownsSandbox: false, registry });
    await handle.run({ command: "echo ready" });
    const signal = run.mock.calls[0]?.[0].abortSignal;
    expect(signal?.aborted).toBe(false);
    controller.abort();
    expect(signal?.aborted).toBe(true);
    expect(() => handle.stop()).toThrow("session owns its lifecycle");
    expect(() => handle.delete()).toThrow("not available");
    expect(stop).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});
