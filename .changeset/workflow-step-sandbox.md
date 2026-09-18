---
"eve": patch
---

Workflow tools can opt in with `sandbox: true` to use `ctx.getSandbox()` inside authored steps. Blocking and background workflows reconnect to the session sandbox across steps without passing live handles through workflow state.
