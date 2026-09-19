---
"eve": patch
---

`/login` now connects a Vercel account or AI Gateway key to an agent whose `model` is a gateway SDK call (such as `gateway(...)`) without trying to rewrite `agent.ts`. Previously the failed source edit discarded the connection and returned to the connection picker, leaving the agent unusable.
