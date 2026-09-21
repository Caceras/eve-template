/**
 * Shape and behavior classification for pending input requests, shared by
 * the harness resolution path and protocol clients (e.g. the dev TUI's
 * rendering decisions).
 */
import type { InputRequest } from "#shared/input.js";

/** Returns true when the request gates an AI SDK tool call. */
export function isApprovalRequest(request: InputRequest): boolean {
  return request.kind === "tool-approval";
}

/**
 * Behavioral class of a pending input request.
 *
 * `"required"` requests need an explicit answer before their gated work can run.
 * `"dismissable"` questions can resolve as `ignored` when the user moves on.
 *
 * Batch and turn ownership determine which work waits and whether a question
 * can be dismissed. This class is not a session-wide scheduling decision.
 */
export type InputRequestClass = "dismissable" | "required";

/** Classifies one pending request; see {@link InputRequestClass}. */
export function classifyInputRequest(request: InputRequest): InputRequestClass {
  switch (request.kind) {
    // AI SDK requires a tool approval to resolve in isolation. Skipping it
    // would leave the intercepted call permanently unadjudicated.
    case "tool-approval":
      return "required";
    // Ignoring a session-limit continuation cannot move forward. The next
    // pre-model gate would park on the same violation again.
    case "session-limit":
      return "required";
    case "question":
      return "dismissable";
    default: {
      const unhandled: never = request.kind;
      return unhandled;
    }
  }
}
