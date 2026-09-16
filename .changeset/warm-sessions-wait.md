---
"eve": patch
---

Create conversation sessions before their first turn through the eve HTTP channel, TypeScript client, and frontend bindings so applications can move durable session startup off the first-message path.

Frontend bindings prewarm on mount and after reset by default (opt out with `prewarm: false`), wait for initialization before sending, and keep consuming the session stream across turns.
