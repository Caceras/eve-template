---
issue: https://github.com/vercel/eve/pull/3590#discussion_r4064820415
status: proposed
last_updated: "2026-09-21"
---

# Local development scope for WebSocket callbacks

## Decision and scope

Implement review item #3 in [PR #3590](https://github.com/vercel/eve/pull/3590),
alongside [delivery-scoped authorization](./local-dev-delivery-authorization.md).
Use the dev-host-verified direct-peer loopback provenance already used by the
PR. The callback wrapping can be developed independently, but its final tests
must cover both direct loopback and direct network upgrades.

`dispatchChannelWebSocketRequest()` currently scopes the call that constructs
`WebSocketRouteHooks`. Nitro invokes the returned callbacks later, outside that
`AsyncLocalStorage.run()`. A session started in `open` or `message` therefore
loses the upgrade request's local capability.

## Observable contract

No authored WebSocket API changes:

- A loopback upgrade supplies its local-dev provenance to work started in
  `upgrade`, `open`, `message`, `close`, or `error`.
- Async work started by a callback inherits its scope. Every invocation gets a
  fresh execution container, so mutable context does not leak between callbacks
  or connections.
- Unauthorized upgrades remain unauthorized, including when their callbacks
  happen to be invoked under another connection's authorized ambient scope.
- A callback uses the immutable verified upgrade provenance, not headers on a
  later callback argument or message data. Existing grant validation still
  rejects it after the dev host's signing state rotates.
- Absent hooks remain absent. Callback arguments, receiver, return values, and
  rejection/throw behavior keep the existing hook contract. Production dispatch
  does not acquire a development capability.

## Implementation

1. **Capture the verified connection scope.** In
   `internal/nitro/routes/channel-dispatch.ts`, capture the local-dev provenance
   while handling the original upgrade. Capture only that scope, not an entire
   mutable execution context. Do not retain the raw developer credential or
   rely on an authored handler leaving the request headers unchanged.
2. **Wrap the returned hooks.** Before returning the hooks object, wrap each
   present lifecycle callback in a fresh local-dev scope seeded from that
   captured provenance. Use a small internal helper, preferably colocated with
   dispatch or the existing request-scope implementation. Reuse the explicit
   unauthorized-scope behavior from the capability prerequisite instead of
   falling back to ambient context. Preserve synchronous hook behavior as well
   as promise-returning hooks; do not introduce unnecessary `async` wrappers.
3. **Leave unrelated lifecycle behavior alone.** Preserve route arguments,
   existing Vercel OIDC resolver behavior, background-task flushing, upgrade
   rejection, and non-development routing. This is not a general WebSocket
   dispatcher or background-task refactor.

```text
verified loopback upgrade -> immutable local-dev provenance
                               |
later callback invocation -> fresh scoped context -> session create/send
```

The delivery plan is still responsible for propagating scope on subsequent
session sends. Restoring ALS in a WebSocket callback alone cannot clear stale
provenance already persisted on the destination session.

## Validation

Extend `internal/nitro/routes/channel-dispatch.test.ts`:

- Return from dispatch, then invoke `open` or `message` outside any request
  scope. Start a session through `args.from(...).send(...)` and assert the
  runtime sees the verified connection provenance, including after an await.
- Exercise continuation through `args.attachSession(...).send(...)` with the
  delivery propagation from review item #1.
- Cover all five optional hooks, absent hooks, arguments/receiver, upgrade
  return values, synchronous exceptions, and asynchronous rejection.
- Interleave authorized and unauthorized connections and invoke an unauthorized
  callback inside an authorized ambient scope. Assert no scope leaks either
  way and that the caller's ambient scope is restored after completion.
- Mutating callback request headers or message data cannot upgrade capability;
  host rotation invalidates a previously captured grant. Production dispatch
  and the existing no-matching-channel rejection remain unchanged.

Add a deterministic scenario using a real upgrade and a lifecycle callback that
starts a session. Assert capability presence for a direct loopback client and
absence for a direct network client. Do not run a real WebSocket server from a
unit test.

Run the targeted unit and scenario files with their tier configs, formatting,
lint, and `pnpm --filter eve typecheck`. Include the behavior in #3590's existing
changeset and document that WebSocket deliveries use upgrade authorization in
`docs/reference/typescript-api.md`; run `pnpm docs:check`. Existing fixture e2e
runs in CI, while the real lifecycle boundary is covered by the scenario test.

## Completion boundary

An authorized local WebSocket client can create or continue a session from a
later callback without losing its capability. Another connection cannot borrow
that scope, and the callback wrapper does not expand who is authorized.
