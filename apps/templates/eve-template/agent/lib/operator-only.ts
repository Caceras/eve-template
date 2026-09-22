import type { Approval } from "eve/tools/approval";
import { isOperator } from "@/lib/operator";

/** Approval policy: the operator's calls run without a prompt; anyone else is refused. */
export const operatorOnly: Approval = ({ session }) =>
  isOperator(session.auth.current)
    ? "not-applicable"
    : { type: "denied", reason: "Only the operator can manage scheduled tasks." };
