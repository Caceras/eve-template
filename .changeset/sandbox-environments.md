---
"eve": minor
---

Replace object-form sandbox definitions with exported provider environments whose `create()` and `getOrCreate()` methods return persistent live sandboxes. The removed `bootstrap` callback is replaced by build-time `environment({ prepare })`; built-in and custom providers share `defineSandboxProvider()`, prepared artifacts are handed directly to runtime creation, live options such as network policy are passed to `create()` or `getOrCreate()`, and Docker and microsandbox support images, Dockerfiles, and read-only resource mounts.
