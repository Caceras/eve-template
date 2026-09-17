import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cancelRun, getWorld } from "#internal/workflow/runtime.js";
import { cancelTaskOwnedWork } from "#execution/tasks/parent/task-cancel.js";
import type { SessionTaskIndexEntry } from "#tasks/session-index.js";

vi.mock("#internal/workflow/runtime.js", () => ({ cancelRun: vi.fn(), getWorld: vi.fn() }));
vi.mock("#execution/tools/workflow/cancel.js", () => ({ cancelWorkflowToolRun: vi.fn() }));
const entry = { taskId: "task", taskRunId: "run" } as SessionTaskIndexEntry;
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("task run shutdown", () => {
  it("uses one metadata-only native wait for cooperative shutdown", async () => {
    const get = vi.fn();
    const waitForTerminalStatus = vi.fn().mockResolvedValue({ status: "completed" });
    vi.mocked(getWorld).mockResolvedValue({ runs: { get, waitForTerminalStatus } } as never);
    await expect(cancelTaskOwnedWork({ entry })).resolves.toBe(false);
    expect(get).not.toHaveBeenCalled();
    expect(cancelRun).not.toHaveBeenCalled();
    expect(waitForTerminalStatus).toHaveBeenCalledExactlyOnceWith("run", {
      resolveData: "none",
      signal: expect.any(AbortSignal),
      timeoutMs: 1_000,
    });
    expect(waitForTerminalStatus.mock.calls[0]![1].signal.aborted).toBe(true);
  });

  it("enforces the grace period even when a native wait ignores its timeout", async () => {
    const waitForTerminalStatus = vi.fn(() => new Promise(() => {}));
    const world = { runs: { waitForTerminalStatus } };
    vi.mocked(getWorld).mockResolvedValue(world as never);
    const result = cancelTaskOwnedWork({ entry });
    await vi.advanceTimersByTimeAsync(999);
    expect(cancelRun).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toBe(true);
    expect(cancelRun).toHaveBeenCalledOnce();
    expect(waitForTerminalStatus).toHaveBeenCalledOnce();
  });

  it.each([false, true])(
    "backs off when native waiting is absent or returns early (%s)",
    async (native) => {
      const read = vi.fn().mockResolvedValue({ status: "running" });
      vi.mocked(getWorld).mockResolvedValue({
        runs: native ? { waitForTerminalStatus: read } : { get: read },
      } as never);
      const result = cancelTaskOwnedWork({ entry });
      await vi.advanceTimersByTimeAsync(1_000);
      await expect(result).resolves.toBe(true);
      expect(read).toHaveBeenCalledTimes(6);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(read).toHaveBeenCalledTimes(6);
      expect(vi.getTimerCount()).toBe(0);
    },
  );
});
