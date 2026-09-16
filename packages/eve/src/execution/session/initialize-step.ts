import { runSessionStep } from "#execution/session/turn-step.js";
import type { DurableStepResult, TurnStepInput } from "#execution/session/turn-step-types.js";

/** Runs session-scoped lifecycle work and publishes the first parked boundary. */
export async function initializeSessionStep(
  input: Omit<TurnStepInput, "abortSignal" | "input">,
): Promise<DurableStepResult> {
  "use step";
  return await runSessionStep({ ...input, input: undefined }, { initializeOnly: true });
}
