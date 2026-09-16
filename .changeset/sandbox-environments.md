---
"eve": minor
---

Replace object-form sandbox definitions with exported provider environments whose `open()` method returns the current eve session's persistent live sandbox. The removed `bootstrap` callback is replaced by build-time `environment({ prepare })`; built-in and custom providers share `defineSandboxProvider()`, prepared artifacts are handed directly to runtime opening, live options such as network policy are passed to `open()`, and Docker and microsandbox support images, Dockerfiles, and read-only resource mounts.
