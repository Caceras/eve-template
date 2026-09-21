---
issue: "untracked"
status: draft
last_updated: "2026-09-21"
---

# Dynamic agent handles

Extend the existing session handle store so tools and hooks can register agent destinations before a conversation exists, then call those handles through the existing task dispatcher.

This branch implements the contract below in the runtime. The earlier isolated
prototype has been removed. See the [authoring examples](../docs/subagents/index.mdx#register-destinations-at-runtime)
for a startup hook reading an external directory and an ordinary tool that
registers and optionally calls a destination.

## Authoring contract

A **destination** names a declared agent or a remote eve endpoint. A **handle** is
its session-local `{ id }` reference. A **binding** is the particular conversation
selected by its first call, or the remote `sessionId` supplied at registration.
Registration requires neither a running conversation nor a reachable service.

```ts
const handle = ctx.registerAgent({
  key: "reviewer",
  description: "Review proposed changes.",
  target: { kind: "remote", url: "https://reviewer.example.com" },
});
const receipt = await ctx.agent(handle, { message: "Review this change." });
```

`defineTool.execute` receives these operations. Hooks receive registration,
update, and removal. Declared agents are registered automatically; ordinary
`ctx.agent("researcher", input)` resolves their registered destination. Named model
tools without `agentId` retain their existing behavior of starting a separate child.

| Operation                          | Observable result                                                                                                                            |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerAgent(destination)`       | Returns a handle immediately, without contacting or starting the destination. Same key and content is idempotent; conflicting content fails. |
| `updateAgent(handle, description)` | Updates the advertised description; identity, target, and binding stay fixed.                                                                |
| `unregisterAgent(handle)`          | Removes advertisement and future access through the handle. Accepted work continues. Re-registration creates a new ID.                       |
| Ordinary `agent(handle, input)`    | Returns `{ status: "working", taskId, agentId }` after local background admission. Completion or failure follows normal task delivery.       |
| Workflow `agent(handle, input)`    | Waits for the final result using the existing durable invocation path. Registration mutations are unavailable inside workflow bodies.        |

Remote registration supports an optional `sessionId`. Without it, the first call
starts a conversation. With it, the call addresses that conversation directly.
After a binding exists, failure does not silently replace it. Unknown and removed
handles fail explicitly. A failed start leaves the destination registered.

A call to a busy, addressed background handle steers its current task and keeps its
result destination. A handle whose first address is still pending can reject a
second call as busy. This implementation does not remove task ownership or redesign
the workflow claim protocol.

## Why this shape

- **Discovery is an ordinary tool.** Directory lookup, search ranking, and tenant
  selection can supply destination descriptors without a dedicated search protocol.
- **Code and models share the store.** A tool may register and call immediately,
  or return an unrelated result and let the model choose from the next advertisement.
- **Knowledge survives availability changes.** Offline and busy destinations stay
  registered; membership does not imply reachability.
- **Static declarations keep their role.** They supply code, tools, credentials,
  and sandbox configuration. Dynamic aliases can refer to them, while new remote
  endpoints need no compiled declaration.

The [registry provider](../packages/eve/src/context/agent-registry.ts) owns a
step-local working view of the existing
[handle store](../packages/eve/src/subagents/handles/store.ts). Registration metadata
travels with handle identity through reservation, dispatch, and settlement.
Ordinary calls reuse the [background task executor](../packages/eve/src/execution/tasks/parent/tool-execution.ts),
including its admission, rollback, cancellation, and result-delivery machinery.
There is no second persisted registry or separate agent execution loop.

## Persistence and publication

Every registered handle is advertised, including busy and never-contacted entries.
The model sees the key, description, handle ID, and execution state, without remote
routing coordinates. `available` describes the absence of an active invocation;
it does not assert network health.

| Boundary                           | Semantics                                                                                                                                 |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Callback mutation                  | Later code in the same step sees the new state immediately.                                                                               |
| Successful harness step            | Provider commit persists the handle store with session state. A tool exception reported as a tool result does not undo earlier mutations. |
| Failed or cancelled step           | Existing provider rollback and accepted-background-task retention apply. Immediate visibility is not a separate durable commit.           |
| `session.started` / `step.started` | Mutations enter the next model request before its context is frozen.                                                                      |
| Tool completion                    | The next eligible request advertises changes after required tool results. The returned tool value does not control advertisement.         |
| Resume / compaction                | Current persisted handles reconstruct the advertisement. Removal can publish an empty listing; unchanged listings are not repeated.       |

Registration alone does not wake an idle session. Requests already in flight retain
their snapshots; new calls resolve current membership. Static registration happens
once per session, so unregistering a static destination persists across resume.
At most 128 destinations may be registered at once; removing unused entries frees
capacity without recycling IDs.

## Remote boundaries

Registration validates the descriptor without network I/O. Uncompiled remote
endpoints use HTTPS public-address validation at socket connection time, bounded
responses, a timeout, and no redirects. They carry no authored credentials. Use a
named declared remote agent to reuse its authored credential resolver.

The destination service authorizes each request. Registering a remote session ID
does not grant ownership: parent termination and cancellation skip externally supplied
sessions. Cancelling the local task stops waiting for its result; remote work may
continue. The current remote cancellation protocol cannot prove ownership of the
active remote turn. Automatic retries, offline queues, health monitoring, and
ambiguous remote acceptance recovery are outside this change.

## Evidence and remaining validation

[Registry integration tests](../packages/eve/src/context/agent-registry.integration.test.ts)
exercise actual tool contexts and the background dispatcher with task transport
mocked. They cover immediate invocation, registration-only tools, serialization,
removal, stale references, duplicate registration, unsafe URLs, and failed dispatch.
[Invocation tests](../packages/eve/src/execution/tools/subagent/invoke-step.integration.test.ts)
check attaching a remote session without starting a replacement.
[Harness tests](../packages/eve/src/harness/tool-loop.test.ts) capture the model request
after `step.started` registration.

The [fixture evals](../e2e/fixtures/agent-agent-tool-controls/evals/)
cover startup advertisement, dynamic registration without returning a handle,
stale-reference rejection, and ordinary-tool delegation through completion. These
run in CI. Local module tests do not prove delivery to a live external service.

The related ownership refactor remains separate: the parent owns the work, the
handle identifies its destination, and the task identifies a job. Removing the
current claim abstraction requires its own replay, cancellation, and result-routing
proof; the reported busy error is not claimed fixed by registration alone.
