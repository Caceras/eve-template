---
"eve": minor
---

Replace object-form sandbox definitions with exported provider environments whose `open()` method returns the current eve session's persistent live sandbox. Providers now own environment and open options, preparation input discovery, native identity, session hooks, minimal serialized state, and start/resume behavior through one `defineSandboxProvider()` contract.
