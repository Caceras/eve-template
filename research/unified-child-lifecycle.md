---
issue: TODO
status: draft
last_updated: "2026-09-17"
---

# Unified child lifecycle

Subagents, background tasks, and workflow tool runs are three implementations
of one concept: a parent session starting a durable child and observing its
lifecycle. They grew separately and now share nothing but the Workflow SDK.
This plan replaces them with one child kind, orchestrated from the parent's
workflow body, with identity assigned by the parent before start.

## Problem

Two structural decisions drive most of the instability in this area.

**Orchestration lives in steps.** Every place the parent waits on a child —
startup, cancel commit, cancel grace, reset release, handoff probe — is a
`"use step"` body or HTTP handler. Steps cannot await hooks, so each wait is a
poll loop: five implementations, five sets of constants, 30-second startup
timeouts that surface as `SUBAGENT_START_FAILED`, "did not commit cancellation"
errors when the child did commit, and steps holding invocations open for
seconds. The one place a workflow body awaits a child startup hook
(`session/handoff.ts`) has none of these problems.

**Identity is won, not assigned.** Session children learn their identity by
winning a hook claim; task children have a parent-picked `taskId` but learn
their run id after start; workflow tool runs pick nothing and orphan a run on
replay. Because identity settles by race, the system carries four inlined loser
protocols, conflict-forwarding, result-time filters, a two-phase handle
reservation spanning two workflows, and `HookConflictError` as ordinary control
flow.

Everything else is downstream: ~20 defensive guards on the cancel path, three
spellings of "the parent's inbox", two notification channels per child, two
HITL answer routes, `resultKind: "subagent"` gating eleven sites, a dead handle
lifecycle still being read, and a stale-route class of HITL bugs where the
parent's proxy map and the child's pending requests disagree.

The default subagent call today touches three runs, five hook tokens, and two
parent-side admission implementations.

## Invariants

1. **Bodies orchestrate; steps only do side effects.** No step blocks on child
   state. Every child interaction is start-in-step → await-in-body →
   finalize-in-step.
2. **Parent mints child identity before start; child adopts it.** Hook claims
   are locks on that id, not the source of it. Duplicate starts are idempotent.
3. **One child kind.** A _child_ has exactly one executor: agent session,
   workflow body, or in-process tool. One inbox token, one lifecycle envelope,
   one parent-wake path, one cancel path, one HITL answer route.
4. **Terminal state is pushed once by the child into the parent inbox.** The
   parent never reads a child's stream to learn its state.
5. **One spelling per address.** A token string encodes the protocol it
   accepts. No physical/logical split is visible above `session-inbox/`.

## Authoring surface

Public APIs are unchanged in shape: `defineSubagent`, `defineTool({ execution:
"background" })`, `defineWorkflowTool`, `ctx.agent()`, `ctx.ask()`, `task_cancel`,
`session.cancel({ tasks })`. Observable differences:

- `task_cancel` is request-only: it returns `{ status: "requested" }` and the
  committed `cancelled` view arrives as the ordinary task notification. Today
  it blocks up to ~2.5 s and can fail spuriously. The tool description is
  updated so the model expects an asynchronous outcome.
- Child startup failures surface as a terminal `failed` task view with a cause,
  not a 30-second timeout error on the parent.
- `subagent.called` carries the parent-minted `childId`; the child's run id is
  not exposed as identity.

`session.reset` semantics are unchanged in the committed scope; see "Root
session ingress" under Sequence.

## Model

```
parent session body                     step                          child run
───────────────────                     ────                          ─────────
childId = hash(sid, turnId, callId)
started  = createHook(`${childId}:started`)
                                        start(childWorkflow, {
                                          childId, executor,
                                          parentInbox, startedToken })
                                        → runId (journaled)
await started ─────────────────────────────────────────────────────── claim lock `${childId}`
  { runId }                                                            resumeHook(started, { runId })
record child { childId, runId, executor }                              run executor
…
inbox ◄──────────────────────────────────────────────────────────────  progress / input-request / terminal
```

**Identity.** `childId = hash(parentSessionId, parentTurnId, callId)`, minted
once. Every other identifier derives from it: inbox token, activity work id,
model-visible `agentId`, dedupe key prefix. This replaces four independent
derivations of the same tuple.

**Startup.** The step's `start()` return value is journaled, so a replayed step
yields the same `runId` without a second start. The lock hook covers the narrow
window where a step crashes after `start()` but before journaling: a second run
claiming `${childId}` loses, resumes `started` with the winner's `runId`, and
exits. The parent body awaits one hook in both cases. No polling, no loser
protocol beyond "resume the same hook".

**Executors.** The child run is one workflow (`childWorkflow`) that owns the
lifecycle and runs one of three executors:

| Executor | Runs where                                                      | Replaces                                                               |
| -------- | --------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `agent`  | Starts a session run; child forwards its inbox                  | `startLocalSubagent`, `startRemoteSubagent`, `agent-invoke` round trip |
| `body`   | `executeWorkflowBody` inside the child run                      | `workflowToolRunWorkflow`, background `taskRunWorkflow`                |
| `tool`   | In-process `execute` in the parent step; child records receipts | `IN_PROCESS_WORKFLOW_EXECUTOR`                                         |

Blocking vs background is a parent-side choice about when to consume the
terminal view, not a different child kind.

**Lifecycle envelope.** The child writes `ChildView` transitions through one
transition function and delivers each to the parent inbox as a `child` command
with dedupe key `${childId}:${kind}:${seq}`. There is no separate
`caller.replyTo` result channel, no `agent-settled`, no owner-inbox
`outcome` message. The parent body's inbox loop is the only consumer.

**Addressing.** Three tokens per child, all derived from `childId`:

- `child:${childId}` — the child's inbox (commands, answers, steering)
- `child:${childId}:started` — startup ack, parent-owned
- `child:${childId}:lock` — ownership lock, child-owned

The parent inbox is addressed by exactly one token everywhere. `AnswerHookRoute`,
`childSessionInbox ?? childContinuationToken` branching, and the physical/logical
wrapping visible in `turn.ts` and `invoke-agent.ts` go away.

**Cancellation.** Parent sends `cancel` to the child inbox and continues. The
child aborts its executor, transitions to `cancelled`, delivers the terminal
view, and exits. Force-stop is the child's own responsibility after its grace
period, not the parent's. The parent's only guard is the inbox dedupe key.

**HITL.** The child forwards `input-request` into the parent inbox with its own
inbox token as `replyTo`. The parent's proxy map is keyed by `childId` and is
the single source of truth; answers go to `child:${childId}`. Stale answers are
rejected by the child's sequence check, not by parent-side route bookkeeping.

**Session identity (open).** Root sessions keep `sessionId = runId` for the
initial owner and the anchor pattern for handoff; nothing in steps 1–5 depends
on changing that. The same two root causes are present at ingress — the
continuation alias claim decides identity, and the reset handler polls for hook
release — but the fix there has a different shape because there is no parent
body to park: the waiting party is an HTTP handler. Whether the child-lifecycle
pattern extends cleanly to ingress, or ingress wants its own design, is
decided after step 5 with the child model in hand. See "Root session ingress"
below.

## What is deleted

Removed outright (no replacement):

- `execution/tasks/parent/{delegate,dispatch,run-parent,task-cancel,control-shared,subagent-task-projection}.ts`
- `execution/tools/subagent/{invoke-step,invoke-preparation,start,task-agent-requests,task-cancel,accept-event-step,emit-called-step}.ts`
- `execution/tools/workflow/{workflow,start,background,run-control,owner,owner-inbox,answer}.ts`
- `execution/{session-workflow-tool-run,route-child-delivery,cancel-descendant-turns-step}.ts`
- `subagents/{start-local,start-remote,handle-dispatch,parent-notification,parent-result,callback-route,callback-step,adapter,invocation}.ts`
- `subagents/handles/` turn-owned phases and `transitions.ts` reserve/claim
- `harness/{workflow-tool-runs,proxy-input-requests}.ts`
- `waitForCommandHookOwner`, `retryUnreachable`, `CANCEL_COMMIT_POLL_*`,
  `TASK_RUN_CANCEL_*`
- Pending the ingress decision: `waitForHookRelease`, `HANDOFF_RETRY_*`,
  `continuation-conflict-step.ts`
- `resultKind: "subagent"` and every branch on it
- `TASK_PROGRESS_STREAM_NAMESPACE` (written, never read)
- `taskDeliveryId` formats ×6 → one

Replaced by smaller equivalents:

- `taskRunWorkflow` + `workflowToolRunWorkflow` → `childWorkflow`
- `tasks/session-index.ts` + `subagents/handles/store.ts` → one `children`
  record keyed by `childId`
- `tasks/child/steps.ts` (8 wake variants) → one `deliverChildViewStep`
- `proxied-deliver-step.ts` + `hitl-proxy-steps.ts` → one answer route

Rough scope: ~12.7k non-test lines are in the affected modules today. The
target is under half that, with the reduction coming from removed
mechanisms rather than compression.

Kept as-is: `applyTaskTransition` (renamed), `raceChannelReads`,
`SessionInputQueue` dedupe, `sessionHookTokens`, `claimHookOwnership`,
handoff anchor/activation, `startWorkflowOnDeployment`, remote transport in
`remote-dispatch.ts` (becomes the `agent` executor's remote arm).

## Sequence

Each step lands independently and leaves `main` green.

1. **`childWorkflow` + `agent` executor for background subagents.** The default
   subagent path moves first because it exercises every mechanism. Parent body
   awaits `started`; old polling stays for the other two kinds.
2. **`body` executor.** Blocking workflow tools and `ctx.agent()` inside bodies
   move onto `childWorkflow`. `workflowToolRunWorkflow` and the
   `agent-invoke` round trip are deleted.
3. **`tool` executor.** Background non-workflow tools. `taskRunWorkflow`
   deleted.
4. **Cancel and HITL on the envelope.** `task_cancel` becomes request-only;
   answer routing keyed by `childId`. Poll loops and guards deleted.
5. **Handle store collapse.** `children` record replaces task index + handles.
   `resultKind` removed.

Steps 1–5 are the committed scope. `waitForHookRelease` and
`continuation-conflict-step.ts` survive them; they are listed under deletion
because the ingress decision below is expected to remove them, not because
steps 1–5 do.

### Root session ingress

Decided after step 5. The question is whether root-session creation and reset
adopt the child pattern (parent-minted identity, lock hook, ingress awaits a
`started` signal) or keep `sessionId = runId` with alias arbitration hardened
in place. Inputs needed before deciding:

- How often alias conflicts actually occur at ingress once children no longer
  race for session hooks (they are the majority of `HookConflictError` today).
- Whether `channel-address.ts` resolve-then-create plus the existing
  `continuationConflictCommand` forwarding is sufficient without a lock hook.
- Whether reset can return on accept and let clients observe `session.reset`
  on the stream, or whether any channel adapter depends on the release wait.
- What the handoff anchor needs if `sessionId` and initial `runId` diverge.

The doc is updated with a concrete step 6 or an explicit "ingress unchanged"
once those are answered.

E2E coverage: `fixture-tasks`, `agent-subagents`, `agent-subagents-hitl`,
`agent-cancellation`, `agent-workflow-tools` evals are the acceptance suite.
The evals' bounded retry loops (`shared.ts`, 20-attempt and 30 s deadline
variants) should shrink as the races they compensate for are removed; a step
that cannot tighten them has not removed the race.

## Out of scope

Remote-agent transport, channel adapters, the turn loop's model-call path,
compaction, and memory are untouched except where they consume child
identity or the parent inbox.
