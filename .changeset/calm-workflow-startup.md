---
"eve": patch
---

Reduce repeated storage reads during subagent and background-task startup, task cancellation, and session reset. Startup waits for the winning workflow's acknowledgement, cancellation consumes streamed task updates, and reset preserves support for sessions on earlier deployments.
