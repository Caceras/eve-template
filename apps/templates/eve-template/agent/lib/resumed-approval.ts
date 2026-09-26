import type { ModelMessage } from "ai";

// eve's own note on a pending approval (harness/hitl/approval-prompt.js).
const PENDING_APPROVALS = "[Pending approvals]";

/**
 * True on the turn eve starts after an approval is answered. That turn has no
 * new message and its history ends with eve's pending-approvals note. The AI
 * SDK runs (or refuses) the approved call only while the answer is the last
 * message, so a user-role note added on this turn would leave the call unrun.
 */
export function resumesApproval(messages: readonly ModelMessage[]) {
  const last = messages.at(-1);
  if (last?.role !== "user") return false;
  const text =
    typeof last.content === "string"
      ? last.content
      : last.content.map((part) => (part.type === "text" ? part.text : "")).join("");
  return text.trimStart().startsWith(PENDING_APPROVALS);
}
