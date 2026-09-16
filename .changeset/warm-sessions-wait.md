---
"eve": patch
---

Create conversation sessions before their first turn through the eve HTTP channel, TypeScript client, and frontend `prewarm: true` option so applications can move durable session startup off the first-message path.

Frontend bindings keep consuming the session stream across turns, wait for prewarming to finish before sending, and prepare a new session after reset.
