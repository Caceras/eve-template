export const WORKFLOW_STARTED_NAMESPACE = "eve.started";

export interface WorkflowStarted {
  readonly runId: string;
  readonly sessionId?: string;
}
