---
issue: https://github.com/vercel/eve/pull/3590#discussion_r4064820400
status: proposed
last_updated: "2026-09-21"
---

# Delivery-scoped local development authorization

## Decision and scope

Implement review item #1 in [PR #3590](https://github.com/vercel/eve/pull/3590).
Keep the editor and source-mount guards already in the PR. Fix the lifetime of
the loopback-derived capability they consume without redesigning route auth or
the context system. The [WebSocket scope fix](./local-dev-websocket-scope.md)
belongs in the same PR.

`LocalDevRequestKey` currently survives context serialization. Session creation
inherits it, but subsequent deliveries update only `AuthKey` in `turn-step.ts`.
A remotely continued session can therefore retain its creator's editing rights.

## Observable contract

The public `getLocalDevCapability()` API stays unchanged. Authorization belongs
to the accepted delivery and its delegated work, not to the session ID:

| Execution                                                      | Capability                                |
| -------------------------------------------------------------- | ----------------------------------------- |
| Initial authorized local request                               | Present                                   |
| Remote or uncredentialed continuation of that session          | Absent                                    |
| Later authorized local continuation                            | Present again                             |
| Workflow steps or child work spawned by an authorized delivery | Preserved across durable boundaries       |
| External message or input response sent to an existing child   | Replaced by that delivery's authorization |
| Prewarmed session receiving its first message                  | Determined by the message, not prewarming |

Durability is still required. Do not make the key virtual or remove it from
serialization. An internal result that resumes already-authorized work is not a
new external authorization grant. Conversely, forwarding an external reply to a
waiting child must not relabel it as trusted internal work.

## Implementation

1. **Stamp deliveries at the runtime boundary.** Capture the active verified
   request scope when creating a session or dispatching a send/respond command.
   Carry provenance outside adapter-owned message data through the internal
   command and `DeliverHookPayload` shapes in `channel/types.ts`,
   `execution/workflow-runtime.ts`, and `execution/session-inbox/protocol.ts`.
   Represent an unauthorized external delivery explicitly, rather than treating
   missing provenance as permission to retain prior context. Callers cannot
   grant authorization through a request-body field.
2. **Apply before authored execution.** Update `execution/session/entry.ts` so
   the initial delivery carries its accepted scope. In
   `execution/session/turn-step.ts`, replace or clear `LocalDevRequestKey` before
   adapter hooks, dynamic agent resolution, and tool/sandbox execution. Steps
   without a new external delivery retain the active work's provenance. An
   ignored mid-turn delivery must restore the interrupted work's provenance,
   following the existing auth-restoration behavior.
3. **Preserve delegation, not session inheritance.** Reuse the provenance path
   through `coordination-dispatch-shared.ts`, subagent startup, and
   `subagents/start-local.ts`. Cover continuations and forwarded input responses,
   not only newly created children. Internal task resumptions must use the
   owning work's scope rather than an unrelated latest session scope. Make
   request-scope clearing explicit: `ContextContainer` currently falls back to
   ambient provenance when its constructor receives `undefined`.
4. **Keep authorization boundaries when batching.** Partition deliveries by
   capability scope as well as auth in `execution/session/input-queue.ts` and
   the steering aggregation in `execution/session/turn.ts`. Ensure
   `harness/messages.ts` cannot silently keep the first delivery's stronger
   capability when coalescing different scopes. Both local and remote callers
   can have the same `localDev()` auth principal, so auth equality is insufficient.

```text
accepted request scope -> durable delivery -> active execution context
                                                 |
                                                 +-> steps and delegated work
next external delivery ----------------------> replace or clear, never inherit
```

The existing self-modification filesystem guard remains a second boundary.
Verify that resuming an editor cannot reuse an already-mounted filesystem after
authorization is lost; invalidate or reauthorize that binding if its lifetime
extends beyond the authorized execution scope.

## Validation

- Unit: command-to-delivery propagation, initial/prewarmed delivery handling,
  context replacement/clearing, ignored steering restoration, and both batching
  paths. Test local/remote orderings with identical route auth.
- Integration: authorized creation followed by an unauthorized continuation
  removes editor availability and rejects source mounting; a later authorized
  continuation works. Include durable serialization, child continuation, and
  forwarded input responses.
- Scenario: exercise the real session HTTP API with a deterministic model and
  credentialed/uncredentialed clients. Assert filesystem denial even when the
  editor child existed before the unauthorized delivery.
- CI e2e: preserve the local delegated-edit golden paths under
  `e2e/fixtures/agent-self-modification/evals/`. Add a regression where the fixture
  harness can vary delivery credentials without extra services or injected env.
  Keep the negative security assertion deterministic rather than relying on a
  model refusing an edit.

Run targeted tests with their `vitest.<tier>.config.ts`, then formatting, lint,
`pnpm --filter eve typecheck`, and `pnpm guard:invariants`. Update the local-dev
capability lifetime documentation in `docs/reference/typescript-api.md`, run
`pnpm docs:check`, and revise #3590's existing changeset. E2e runs only in CI.

## Completion boundary

No remote continuation, steering batch, or child reply gains source access from
a session's history. Authorized delegated edits still work. This fix does not authenticate forwarded or proxied callers. The documented
boundary remains direct-peer loopback provenance, and developers must protect
any endpoint they forward to untrusted clients.
