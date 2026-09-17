import { readWorkflowStream } from "#execution/workflow-stream.js";

import {
  WORKFLOW_STARTED_NAMESPACE,
  type WorkflowStarted,
} from "#execution/workflow-started-contract.js";

export async function readWorkflowStarted(runId: string): Promise<WorkflowStarted> {
  const started = await readWorkflowStream<WorkflowStarted>({
    runId,
    namespace: WORKFLOW_STARTED_NAMESPACE,
    timeoutMs: 30_000,
    accept: () => true,
  });
  if (started === undefined)
    throw new Error(`Workflow "${runId}" did not acknowledge startup within 30 seconds.`);
  return started;
}
