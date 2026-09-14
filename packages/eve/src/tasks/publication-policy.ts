import type { TurnDeliveryContext } from "#tasks/delivery-policy.js";

/** Scheduled launch text stays quiet without changing the invocation's lifetime. */
export function shouldPublishAssistantText(input: TurnDeliveryContext): boolean {
  if (input.hasOutputSchema || input.isChild) return true;
  if (input.taskDeliveryPhase === "pending" || input.taskDeliveryPhase === "settled") return true;
  return !input.isFirstTurn || !input.hasScheduleProvenance;
}
