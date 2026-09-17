import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSessionStep } from "#execution/create-session-step.js";
import { workflowEntry } from "#execution/session/entry.js";
import type { InitialWorkflowEntryInput } from "#execution/session/entry-input.js";
import { failSession, runPreparedSession } from "#execution/session/program.js";
import { publishWorkflowStartedStep } from "#execution/workflow-started-step.js";

const inbox = vi.hoisted(() => ({ claimSessionHook: vi.fn(), dispose: vi.fn() }));
vi.mock("#compiled/@workflow/core/index.js", () => ({
  getWorkflowMetadata: () => ({ workflowRunId: "candidate", workflowStartedAt: new Date(0) }),
  getWritable: () => ({}),
}));
vi.mock("#execution/session-inbox/inbox.js", () => ({ createSessionInbox: () => inbox }));
vi.mock("#execution/create-session-step.js", () => ({ createSessionStep: vi.fn() }));
vi.mock("#execution/workflow-started-step.js", () => ({ publishWorkflowStartedStep: vi.fn() }));
vi.mock("#execution/session/program.js", () => ({
  failSession: vi.fn(),
  runPreparedSession: vi.fn(),
}));
vi.mock("#execution/session/handoff-steps.js", () => ({}));
vi.mock("#execution/continuation-conflict-step.js", () => ({}));
vi.mock("#subagents/parent-notification.js", () => ({}));

const input: InitialWorkflowEntryInput = {
  acknowledgeStartup: true,
  kind: "initial",
  input: {},
  ownerDeploymentId: "deployment",
  serializedContext: {
    "eve.bundle": { source: { kind: "bundled" } },
    "eve.continuationToken": "conversation",
    "eve.mode": "conversation",
  },
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(runPreparedSession).mockResolvedValue({ output: "" });
});

describe("initial session ownership acknowledgement", () => {
  it.each([false, true])(
    "acknowledges before session creation settles (duplicate: %s)",
    async (duplicate) => {
      const creation = Promise.withResolvers<Awaited<ReturnType<typeof createSessionStep>>>();
      vi.mocked(createSessionStep).mockReturnValue(creation.promise);
      if (duplicate) {
        inbox.claimSessionHook.mockResolvedValueOnce(undefined).mockRejectedValueOnce({
          name: "HookConflictError",
          conflictingRunId: "winner",
        });
      }
      const run = workflowEntry(input);
      try {
        await vi.waitFor(() =>
          expect(publishWorkflowStartedStep).toHaveBeenCalledWith(
            duplicate
              ? { runId: "winner", continuationToken: "conversation" }
              : { runId: "candidate", sessionId: "candidate" },
          ),
        );
        expect(runPreparedSession).not.toHaveBeenCalled();
        expect(inbox.dispose).not.toHaveBeenCalled();
      } finally {
        creation.resolve({ state: {} as Awaited<ReturnType<typeof createSessionStep>>["state"] });
        await run;
      }
      if (duplicate) {
        expect(runPreparedSession).not.toHaveBeenCalled();
        expect(inbox.dispose).toHaveBeenCalledOnce();
      } else {
        expect(runPreparedSession).toHaveBeenCalledOnce();
      }
    },
  );

  it("reports construction failure after acknowledging ownership", async () => {
    const creation = Promise.withResolvers<Awaited<ReturnType<typeof createSessionStep>>>();
    vi.mocked(createSessionStep).mockReturnValue(creation.promise);
    const error = new Error("Bundle unavailable");
    const run = workflowEntry(input);
    try {
      await vi.waitFor(() => expect(publishWorkflowStartedStep).toHaveBeenCalledOnce());
    } finally {
      creation.reject(error);
      await run;
    }
    expect(inbox.dispose).toHaveBeenCalledOnce();
    expect(failSession).toHaveBeenCalledWith(expect.objectContaining({ error }));
    expect(runPreparedSession).not.toHaveBeenCalled();
  });

  it.each([0, 1])("does not acknowledge when hook claim %i fails", async (claim) => {
    const error = new Error("Hook unavailable");
    if (claim === 1) inbox.claimSessionHook.mockResolvedValueOnce(undefined);
    inbox.claimSessionHook.mockRejectedValueOnce(error);
    vi.mocked(createSessionStep).mockResolvedValue({
      state: {} as Awaited<ReturnType<typeof createSessionStep>>["state"],
    });
    await workflowEntry(input);
    expect(publishWorkflowStartedStep).not.toHaveBeenCalled();
    expect(failSession).toHaveBeenCalledWith(expect.objectContaining({ error }));
    expect(inbox.dispose).toHaveBeenCalledOnce();
  });
});
