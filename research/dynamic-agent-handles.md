---
issue: "untracked"
status: draft
last_updated: "2026-09-21"
---

# Dynamic agent handles

Generalize the existing handle store so ordinary tools can register agent destinations, invoke them through `ctx.agent(handle)`, and make them visible to the model through the same advertisement mechanism as static agents.

This is a proposed public contract, not an implemented API. Search is a future
consumer of the mechanism and is outside this proposal.

## Authoring model

A **destination** identifies an agent that can be called. A **handle** is the
current session's registered reference to that destination. A **session binding**
identifies a particular conversation with it. Registration requires neither a
running conversation nor a reachable destination.

Inside an ordinary `defineTool.execute` callback:

```ts
const handle = await ctx.registerAgent(destination);
const result = await ctx.agent(handle, { message: "Review this change." });
```

The method name and destination descriptor are provisional. The intended
composition is fixed: registration returns a handle that the same callback can
immediately invoke. Registration alone performs no invocation or health check.
A tool can also register destinations and return, leaving the model to choose
which agent to call next.

Static agents already enter the runtime subagent registry during setup.
They continue to register automatically; authors do not register them again.
Their callable references should converge with dynamic handles on one invocation
contract. Today, that registry and the session handle store are distinct
constructs; unifying their contract is part of this change. [Static registration][static],
[handle store][store].

## What this enables

- **Discovery implemented as an ordinary tool.** A future search tool can
  register its selected results without a special discovery protocol in eve.
  Any other tool can supply destinations through the same operation.
- **Agents selected at runtime.** Startup code or a tool can register the
  destinations appropriate to a customer, project, or task. Dynamic destinations
  need not each have a predeclared subagent definition.
- **Both code-directed and model-directed delegation.** A tool can register and
  call an agent immediately, or populate the store for later model selection.
  Both use the same handles and destination resolution.
- **Destinations that outlive individual conversations.** Registration can
  precede the first call and survive an expired session or failed invocation.
  An offline destination can remain known and be tried later.

These are intended capabilities of the proposed contract. Static subagents
remain a convenient way to declare agents; they cease to be the exclusive path
for introducing callable destinations.

## Behavior and timing

The store determines membership: **every registered handle is advertised**.
Busy, offline, and unknown reachability are descriptions of an entry, not reasons
to hide it. The model sees safe identity, description, and relevant status;
private routing and credentials remain outside context.

| Operation       | Required behavior                                                                                                                                   |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Register        | Validate and add a destination. Repeating the same identity and content is idempotent. The returned handle is immediately usable by code.           |
| Update          | Change the registered entry and its next advertisement. Conflicting concurrent updates need an explicit policy.                                     |
| Unregister      | Remove the entry from subsequent advertisements. This does not itself cancel accepted work.                                                         |
| Invoke          | Resolve the handle, authorize the operation, select or create a session, and attempt delivery. Session-selection rules remain to be decided.        |
| Fail invocation | Preserve the registered destination. Distinguish unavailable service, denied access, expired session, and unknown acceptance after a lost response. |

Registration does not grant ownership of another session or permission to cancel
its work. An unknown or removed handle must fail explicitly; it must not silently
start a replacement conversation. Automatic retries, offline queueing, and health
monitoring are outside this proposal.

Code visibility and model visibility have different boundaries:

| When registration happens           | When it is usable or visible                                                                                                                                               |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Within a tool                       | Subsequent code in that callback can call the returned handle immediately.                                                                                                 |
| During startup                      | Initial registrations are published before the first model request.                                                                                                        |
| During a tool call                  | Committed changes are advertised on the next eligible model request, after the required tool results are recorded. The tool's return value does not control advertisement. |
| After a request's context is frozen | That request keeps its snapshot; changes appear on a later request. Dispatch revalidates a selected handle against current state.                                          |

Publication replaces the model's current view conceptually, while retaining
conversation history. Unchanged views need not be repeated; removal of the last
entry must publish an empty view. Resume and compaction must reconstruct the
current advertisement from persisted state when necessary. Registration alone
does not wake an idle session.

The exact hook cutoff and durable commit point remain open. In particular,
“usable by subsequent code” must not be confused with “already persisted.”

## Generalize the existing machinery

Reuse the existing store, invocation machinery, and context publication path.
The main change is separating **registered destination membership** from
**session and invocation lifecycle**.

| Existing behavior                                                                                                                                                         | Necessary generalization                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Handles record delegated-child ownership; addressed entries require a session ID. [Store][store]                                                                          | Represent a registered destination before a session exists, and retain it independently of session lifetime.                                                |
| Tool context has no registration operation; `ctx.agent` currently lives on workflow context. [Tool context][tool], [workflow context][workflow]                           | Expose registration and handle-based invocation to ordinary tools, while retaining the runtime's ownership of authorization, persistence, and cancellation. |
| Invocation resolves a named subagent definition before using a handle. Unknown IDs fall back to a fresh start. [Resolution][resolution], [classification][classification] | Resolve dynamic destinations through the registered handle; distinguish a valid destination without a session from a stale handle.                          |
| Publication filters handles by lifecycle state and runs before `step.started`; pending tool calls can defer it. [Projection][projection], [model loop][loop]              | Advertise every registered destination at one defined request boundary, preserving valid tool-call/result ordering.                                         |

This is a plausible extension of existing components, but it is not just a new
store setter. The largest feasibility question is exposing agent invocation in
ordinary tools while preserving the durable behavior currently provided through
workflow tools. The implementation must demonstrate that path before treating
the API example as executable.

## Decisions needed before implementation

1. **Handle and destination shape.** Define destination identity, how routing and
   credentials are resolved, how static handles are obtained, and whether calls
   create or reuse a session. Define busy-session behavior explicitly.
2. **Persistence and replay.** Specify what successful registration guarantees,
   whether it survives a later tool exception, and how immediate
   registration→invocation behaves under cancellation or replay. A lost response
   must not be treated as proof that remote work was never accepted.
3. **Publication cutoff.** Identify which startup and hook mutations enter each
   request, and serialize concurrent updates without losing entries.
4. **Model calling surface.** Decide whether the existing `agent` tool accepts
   all advertised handles or named tools remain. Both model and authored-code
   calls must resolve the same destination and enforce the same permissions.

## Related refactor: invocation ownership and steering

The parent session owns the work; a task or invocation identifies a particular
job, while the agent handle identifies its destination or conversation. The
current implementation also calls the active invocation the handle's “owner,”
which obscures these distinct relationships. [Handle ownership][ownership].

Refactor toward a direct contract: sending a correction to a busy agent handle
updates its current work and preserves the task and result destination. The
model should not need a task ID to do this. Existing steering tests already
require preservation of the task and handle. [Steering contract][steering].

Audit `taskId`, `operationId`, and `callId` against their lifetimes, replay,
cancellation, and result routing before deciding which can be consolidated.
Distinguishing successive jobs remains necessary; the current claim abstraction
and number of identifiers are not assumed necessary. This follow-up is a design
direction, not an established root cause for the reported busy error.

## Validation

The smallest proof is an ordinary tool registering a destination absent from
compiled subagent definitions, calling its handle in the same callback, and
having that handle appear in the next captured model request. Repeat with a tool
that only registers and returns an unrelated value. Static agents must remain
callable without manual registration.

Then test the boundaries: offline registration without invocation I/O; duplicate
and concurrent mutations; exceptions, cancellation, and replay; stale IDs; failed
invocations preserving registration; removal of the last entry; and
compaction/resume restoring the advertised set. Check persisted state and actual
model requests, not only API return values.

Source baseline: `vercel/eve` commit
`b333e7deace4831b58797639c4aed20649e4a0ae` (September 20). Source was inspected;
no runtime prototype has been implemented or tested for this proposal.
No issue is linked yet.

[static]: https://github.com/vercel/eve/blob/b333e7deace4831b58797639c4aed20649e4a0ae/packages/eve/src/runtime/subagents/registry.ts#L64-L127
[store]: https://github.com/vercel/eve/blob/b333e7deace4831b58797639c4aed20649e4a0ae/packages/eve/src/subagents/handles/store.ts#L11-L208
[tool]: https://github.com/vercel/eve/blob/b333e7deace4831b58797639c4aed20649e4a0ae/packages/eve/src/tools/definition.ts#L139-L195
[workflow]: https://github.com/vercel/eve/blob/b333e7deace4831b58797639c4aed20649e4a0ae/packages/eve/src/tools/workflow-definition.ts#L89-L103
[resolution]: https://github.com/vercel/eve/blob/b333e7deace4831b58797639c4aed20649e4a0ae/packages/eve/src/execution/tools/subagent/invoke-preparation.ts#L241-L288
[classification]: https://github.com/vercel/eve/blob/b333e7deace4831b58797639c4aed20649e4a0ae/packages/eve/src/execution/tools/subagent/invoke-preparation.ts#L109-L137
[projection]: https://github.com/vercel/eve/blob/b333e7deace4831b58797639c4aed20649e4a0ae/packages/eve/src/subagents/handles/prompt.ts#L22-L98
[loop]: https://github.com/vercel/eve/blob/b333e7deace4831b58797639c4aed20649e4a0ae/packages/eve/src/harness/tool-loop.ts#L1103-L1222
[ownership]: https://github.com/vercel/eve/blob/d004e6d47e9d25d0380c24b5a47b65a18f8b2784/packages/eve/src/subagents/handles/transitions.ts#L310-L355
[steering]: https://github.com/vercel/eve/blob/d004e6d47e9d25d0380c24b5a47b65a18f8b2784/packages/eve/src/execution/tasks/parent/tool-execution.integration.test.ts#L138-L155
