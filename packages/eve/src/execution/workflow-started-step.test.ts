import { beforeEach, describe, expect, it, vi } from "vitest";
import { getWritable } from "#compiled/@workflow/core/index.js";
import { resolveSessionInbox } from "#execution/session-inbox/resume.js";
import { publishWorkflowStartedStep } from "#execution/workflow-started-step.js";

vi.mock("#compiled/@workflow/core/index.js", () => ({ getWritable: vi.fn() }));
vi.mock("#execution/session-inbox/resume.js", () => ({ resolveSessionInbox: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe("workflow startup signals", () => {
  function writer() {
    const value = { write: vi.fn(), releaseLock: vi.fn() };
    vi.mocked(getWritable).mockReturnValue({ getWriter: () => value } as never);
    return value;
  }

  it("does not look up ownership again when this session won", async () => {
    const output = writer();
    await publishWorkflowStartedStep({ runId: "initial", sessionId: "initial" });
    expect(resolveSessionInbox).not.toHaveBeenCalled();
    expect(output.write).toHaveBeenCalledWith({ runId: "initial", sessionId: "initial" });
    expect(output.releaseLock).toHaveBeenCalledOnce();
  });

  it("resolves the stable session identity when a successor owns a competing alias", async () => {
    const output = writer();
    vi.mocked(resolveSessionInbox).mockResolvedValue({ sessionId: "original" });
    await publishWorkflowStartedStep({ runId: "successor", continuationToken: "alias" });
    expect(resolveSessionInbox).toHaveBeenCalledExactlyOnceWith("alias");
    expect(output.write).toHaveBeenCalledWith({ runId: "successor", sessionId: "original" });
  });

  it("does not acknowledge a conflict when its session identity cannot be read", async () => {
    const output = writer();
    vi.mocked(resolveSessionInbox).mockRejectedValue(new Error("storage unavailable"));
    await expect(
      publishWorkflowStartedStep({ runId: "successor", continuationToken: "alias" }),
    ).rejects.toThrow("storage unavailable");
    expect(output.write).not.toHaveBeenCalled();
  });
});
