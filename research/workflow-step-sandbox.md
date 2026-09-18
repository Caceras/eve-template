---
issue: https://github.com/vercel/eve/issues/3201
status: implemented
last_updated: "2026-09-18"
---

# Sandbox access in workflow steps

Static workflow tools opt in with `sandbox: true`; their authored steps borrow the session sandbox while the session retains lifecycle ownership.

The approval ordering fix in [#3198](https://github.com/vercel/eve/issues/3198) must land with or before this change.

## Authoring contract

Use `defineWorkflowTool({ sandbox: true, execute })` and pass `ctx` directly to a `"use step"` helper typed as `WorkflowStepToolContext`. Both blocking and background workflows support this contract. The workflow body remains deterministic and cannot open a sandbox.

## Boundaries

- Dispatch opens or reconnects the sandbox after any required tool approval. Provisioning is eager, including when the body never calls `getSandbox`.
- Dispatch captures the compiled artifact source, agent node, sandbox session identity, and reconnect state. Only this serializable record crosses the workflow boundary.
- The existing workflow step context wrapper reconnects the backend and binds operations to the step's abort signal. Repeated calls in one step reuse its handle.
- Steps cannot stop or delete the shared sandbox. They consume or kill spawned processes before returning and return serializable results, never live handles or streams.
- Sandbox expiration and backend failures retain the backend's existing recovery behavior; this change adds no new persistence guarantees.

## Validation

Runtime integration coverage checks file persistence across a durable sleep and successive steps for blocking and background tools, plus clear failures without opt-in or from the workflow body. Fixture evals exercise the same contract through an agent. CI is required for the fixture evals.
