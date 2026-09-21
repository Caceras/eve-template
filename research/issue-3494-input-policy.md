---
issue: https://github.com/vercel/eve/issues/3494
status: implemented
last_updated: "2026-09-21"
---

# HITL state, policy, and effects

One pure policy selects pending-input work; scheduling and resolution use that policy without adding durable state.

This refactor stacks on [#3564][base]. The base fixes historical input blocking a later user turn. This change preserves that behavior and removes overlapping decisions from the approval, question, and session-limit resolvers. It does not import the ledger migration from [#2822][ledger].

| Boundary       | Construct                                                         | Responsibility                                                                                                                                                                                        |
| -------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| State          | Existing pending batches, deferred input, and turn emission state | Record requests, accepted responses, and ownership.                                                                                                                                                   |
| Policy         | `decidePendingInput`                                              | Return `continue`, `wait`, or `resolve`, including selected batches and input to retain. No session writes, tool execution, or model calls.                                                           |
| Action/effects | `applyInputAction`                                                | Apply selected responses, record approvals, construct transcript/results, remove resolved batches, and retain selected input. Existing runtime code still performs model/tool calls and emits events. |

`resolvePendingInput` reads state, calls the policy, then applies its action. `hasRunnableDeferredStepInput` uses the same policy to decide whether stored responses can resolve work. Non-response deliveries such as a new message or runtime result remain runnable so the runtime can process them, including requesting required input.

For example, with independent requests A, B, and question Q pending, a delivery answering A and Q produces a `resolve(A)` action retaining Q's answer. The SDK requires the approval response at the transcript tail. Once A finishes, the same policy selects `resolve(Q)` despite B remaining unanswered. With only A answered in one A+B batch, the policy retains A's response without scheduling the incomplete batch.

The policy preserves current-turn blocking, session-budget priority, sole-question dismissal, response authorization, and SDK transcript ordering. The resulting action is transient. There is no new queue, persisted readiness flag, public API, or independent lifecycle engine.

The existing [HITL golden evals][evals] remain the durable-world acceptance tests. The colocated [policy specifications][specs] test decisions directly, including immutable input. Local module tests cannot establish E2E success; the stacked PR records results for its own head.

[base]: https://github.com/vercel/eve/pull/3564
[ledger]: https://github.com/vercel/eve/pull/2822
[evals]: ../e2e/fixtures/agent-tools-hitl/evals/hitl/continuation/README.md
[specs]: ../packages/eve/src/harness/hitl/input-policy.test.ts
