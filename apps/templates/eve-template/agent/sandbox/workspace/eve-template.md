# eve template workspace

This file is seeded into `/workspace` from `agent/sandbox/workspace/` by eve's sandbox.

Use this workspace for large or temporary working context. The app pins eve's just-bash sandbox in `agent/sandbox/sandbox.ts` instead of letting eve pick a backend, because its server has no Docker socket or VM runtime. just-bash is a JavaScript shell over a virtual filesystem: it runs no native processes, cannot use OCI images and has no network isolation. Change that file to choose another backend, bootstrap hook, lifecycle hook, or network policy.

The active template demonstrates tools, skills, state, memory, workflows, subagents, schedules, hooks, connections, channels, evals, streaming, HITL, and the official registry while leaving framework defaults intact wherever possible.
