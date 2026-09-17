import { getRun } from "#internal/workflow/runtime.js";

/** One cancellable subscription, including entries already committed before the read starts. */
export async function readWorkflowStream<T>(input: {
  readonly runId: string;
  readonly namespace: string;
  readonly startIndex?: number;
  readonly timeoutMs: number;
  readonly accept: (value: T) => boolean;
}): Promise<T | undefined> {
  const reader = getRun(input.runId)
    .getReadable<T>({ namespace: input.namespace, startIndex: input.startIndex })
    .getReader();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        while (true) {
          const next = await reader.read();
          if (next.done) return undefined;
          if (input.accept(next.value)) return next.value;
        }
      })(),
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), input.timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
