---
"eve": patch
---

Workflow tools can use `ctx.getSandbox()` inside authored steps without an opt-in. The sandbox opens only when accessed. Blocking and background workflows reconnect to the session sandbox across steps without passing live handles through workflow state.
