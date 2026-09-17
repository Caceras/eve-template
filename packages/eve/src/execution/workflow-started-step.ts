import { getWritable } from "#compiled/@workflow/core/index.js";
import {
  WORKFLOW_STARTED_NAMESPACE,
  type WorkflowStarted,
} from "#execution/workflow-started-contract.js";
import { resolveSessionInbox } from "#execution/session-inbox/resume.js";

/** A duplicate candidate publishes the winner on its own stream so its caller never polls hooks. */
export async function publishWorkflowStartedStep(
  input: WorkflowStarted & {
    readonly continuationToken?: string;
  },
): Promise<void> {
  "use step";
  const sessionId =
    input.continuationToken === undefined
      ? input.sessionId
      : (await resolveSessionInbox(input.continuationToken)).sessionId;
  const writer = getWritable<WorkflowStarted>({
    namespace: WORKFLOW_STARTED_NAMESPACE,
  }).getWriter();
  try {
    const started: { runId: string; sessionId?: string } = { runId: input.runId };
    if (sessionId !== undefined) started.sessionId = sessionId;
    await writer.write(started);
  } finally {
    writer.releaseLock();
  }
}
