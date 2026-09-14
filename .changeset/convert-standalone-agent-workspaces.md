---
"eve": patch
---

`eve init <name>` can now convert a standalone agent project into an `agents/` workspace before adding the named agent. Generated Web Chat projects retain their root app and are rewired to the moved original agent; custom Next.js apps and Vercel service graphs stop with manual migration guidance.
