import type { ApprovalPolicy } from "eve/tools/approval";
import { isOperator } from "@/lib/operator";

/** Approval policy: the operator's calls run without a prompt; anyone else is refused. */
export const operatorOnly: ApprovalPolicy = ({ session }) =>
  isOperator(session.auth.current)
    ? "not-applicable"
    : { type: "denied", reason: "Only the operator can manage scheduled tasks." };

/**
 * Like `operatorOnly`, but the operator confirms each call first: for changes
 * that cannot be undone or that set what runs unattended later, which injected
 * text (a fetched page, an issue) must not be able to make on its own.
 */
export const operatorConfirms: ApprovalPolicy = ({ session }) =>
  isOperator(session.auth.current)
    ? "user-approval"
    : { type: "denied", reason: "Only the operator can manage scheduled tasks." };
