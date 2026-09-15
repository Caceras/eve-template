---
"eve": patch
---

Bound idle session stream responses so abandoned serverless invocations release their durable stream readers instead of running until the host timeout. Runs and recorded events continue unaffected, and clients can resume from their durable cursor.
