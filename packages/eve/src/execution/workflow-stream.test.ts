import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRun } from "#internal/workflow/runtime.js";
import { readWorkflowStream } from "#execution/workflow-stream.js";

vi.mock("#internal/workflow/runtime.js", () => ({ getRun: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("workflow stream waits", () => {
  function fixture() {
    let controller!: ReadableStreamDefaultController<number>;
    const cancel = vi.fn();
    const stream = new ReadableStream<number>({
      start(value) {
        controller = value;
      },
      cancel,
    });
    const getReadable = vi.fn(() => stream);
    vi.mocked(getRun).mockReturnValue({ getReadable } as never);
    const read = () =>
      readWorkflowStream<number>({
        runId: "run",
        namespace: "events",
        startIndex: -1,
        timeoutMs: 100,
        accept: (value) => value === 3,
      });
    return { cancel, controller, getReadable, read, stream };
  }

  it("consumes existing and future entries through one subscription", async () => {
    const f = fixture();
    f.controller.enqueue(1);
    const result = f.read();
    f.controller.enqueue(2);
    f.controller.enqueue(3);
    await expect(result).resolves.toBe(3);
    expect(f.getReadable).toHaveBeenCalledExactlyOnceWith({ namespace: "events", startIndex: -1 });
    expect(f.cancel).toHaveBeenCalledOnce();
    expect(f.stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds an idle subscription and cancels the pending read", async () => {
    const f = fixture();
    const result = f.read();
    await vi.advanceTimersByTimeAsync(100);
    await expect(result).resolves.toBeUndefined();
    expect(f.cancel).toHaveBeenCalledOnce();
    expect(f.stream.locked).toBe(false);
  });

  it("returns on EOF without treating it as a matching event", async () => {
    const f = fixture();
    f.controller.close();
    await expect(f.read()).resolves.toBeUndefined();
    expect(f.stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("propagates storage errors and releases the reader", async () => {
    const f = fixture();
    const failure = new Error("storage unavailable");
    f.controller.error(failure);
    await expect(f.read()).rejects.toBe(failure);
    expect(f.stream.locked).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});
