---
issue: "untracked"
status: prototype
last_updated: "2026-09-21"
---

# Dynamic agent handles prototype

An external directory and ordinary tools can populate the same session registry; registered destinations become callable immediately and enter context at the next request boundary.

This runnable contract experiment accompanies the [proposal](../dynamic-agent-handles.md).
It imports eve's actual `defineTool` and `resolveAgentsAnnouncement`. Its session
store and dispatcher are research substitutes: it does **not** modify the
production handle store, execute durable delegation, or call a model. Captured
requests are message arrays assembled by this runner, not production traces.

## Run

From the repository root, after installing dependencies, with Node 24 or newer:

```sh
node --conditions=eve-source research/dynamic-agent-handles-prototype/demo.ts
node --conditions=eve-source --test research/dynamic-agent-handles-prototype/prototype.test.ts
```

`eve-source` resolves imports to source files, avoiding stale compiled output.
These are standalone research tests, outside eve's normal unit/integration/scenario
tiers and CI test discovery. The demo starts and closes a loopback HTTP directory.
No model credentials or external services are required. Agent responses are
deterministic fixtures; only directory reads cross an HTTP boundary.

## Two ways to populate handles

**Load an external source before the first request.** The demo fetches a JSON
directory containing destinations, including an existing session binding and an
offline destination:

```ts
await loadExternalAgents(session.context, configuredDirectoryURL);
const firstRequest = session.captureRequest();
```

The directory returns records such as:

```json
{
  "key": "operations",
  "description": "Checks operations.",
  "route": "reviewer",
  "sessionId": "existing-ops-session"
}
```

`key` identifies the destination within this session. `route` is a private
application routing key, not a URL chosen by the model. `sessionId` optionally
binds the destination to an existing conversation; omit it to create one on the
first successful call. Registration performs no agent I/O or reachability check.
The application configures the directory URL; reads have a timeout, size/count
limits, and reject redirects. Catalog entries cannot redirect the fetch.

**Use an ordinary tool during the session.** [Examples](./examples.ts) includes
`discoveryTool`, which reads that source and returns only `{ loaded: count }`.
The new handles still enter the next advertisement. A second tool registers and
calls a destination in the same callback:

```ts
async execute(_input, baseCtx) {
  const ctx = prototypeContext(baseCtx);
  const handle = ctx.registerAgent({
    key: "change-reviewer",
    description: "Reviews code changes.",
    route: "reviewer",
  });
  return ctx.agent(handle, { message: "Review the new handle registration contract." });
}
```

`prototypeContext` is the explicit bridge to the experimental methods. Production
`ToolContext` does not have them yet. The runner supplies only this bridge and a
call ID; other tool context services and schema validation are not emulated.
The eventual public API would expose the methods directly on `ctx`.

`updateDescriptionTool` changes an existing entry without replacing its handle.
Startup `staticAgents` enter the same registry automatically, so both static and
discovered destinations use `ctx.agent(handle, input)`. This models the intended
contract; it does not exercise eve's compiler or static-agent runtime bootstrap.

## Concrete policies to evaluate

| Boundary      | Prototype behavior                                                                                                                                                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identity      | Same key and content returns the same handle. Conflicting registration throws. Description updates are explicit; routing/binding changes require removal and new registration.                                                        |
| Sessions      | An optional supplied binding is used immediately. Otherwise the first successful call records a binding, reused by later calls. Expiry fails without a fresh-session fallback.                                                        |
| Membership    | Every registered destination is advertised. The existing renderer's `available` attribute means no call is pending here; the status text reports unknown reachability or the last failure. It is not a health assertion.              |
| Mutation      | Each synchronous mutation commits to in-memory state immediately, including if a later tool operation throws. Directory imports are additive; missing records are not removals. Multiple valid registrations are not an atomic batch. |
| Publication   | Startup changes enter the first captured request. During a tool, code sees changes immediately; publication waits until all tool results are recorded. Old captured requests keep their snapshots.                                    |
| Authorization | The application must supply an invocation authorizer. Registration grants no permission; every invocation rechecks it. Production resource-scoped authorization remains unimplemented.                                                |
| Failure       | Unavailable, denied, expired-session, and uncertain acceptance are distinct outcomes. Registration survives each. No retry, queue, or replacement session is automatic.                                                               |
| Removal       | Stale and foreign-session handles fail. Removing an entry does not cancel accepted work; completion cannot recreate the entry. Re-registration produces a new handle.                                                                 |
| Restore       | A trusted JSON snapshot restores entries and bindings into an empty session. Clearing prototype history republishes current entries. Snapshots reject active work.                                                                    |

The tests exercise these boundaries using real tool callbacks, HTTP directory
reads, captured message arrays, and restored state. They also check escaped
advertisements, omitted private routing, unchanged-view deduplication, and an
empty advertisement when the last entry is removed.

## Production work still required

The registry in this experiment is intentionally disposable. Generalize
`AgentHandleStore` in place; do not install this as a second production store.
Wire registration into the existing session context and publication path, and
resolve the ordinary-tool versus durable-workflow invocation boundary described
in the proposal. Validate real model requests and persisted state there.

The dispatcher here finishes in the same process. It does not establish crash
recovery, replay/idempotency, multi-worker concurrency, cancellation, remote eve
authentication, or production session creation. The runner executes tools serially.
Overlapping calls to one handle
return `busy`; steering accepted work is still part of the related ownership
refactor. No claim is made that the reported busy-agent error is fixed.
