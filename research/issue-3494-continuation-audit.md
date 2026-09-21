---
issue: https://github.com/vercel/eve/issues/3494
status: implemented
last_updated: "2026-09-21"
---

Earlier pending input can block runnable work in a later turn. This historical audit recorded 19 failing scenarios and 14 passing controls across 33 deterministic harness probes; it is not the current test inventory.

The counts describe scenarios, not 19 independent defects. The red baseline was captured before the runtime fix at `52fe60f8af564a2c895bf4012f0f44df2beca915` on `ruiconti/issue-3494-eval`. These are local integration reproductions, not additional live-model or durable-world eval results.

## Expected path and observed divergence

Let `A` be an approval batch created by turn 0, and `R` the result of an unrelated tool requested by turn 1. Expected: retain `A`, append `R`, let the model consume `R`, and settle turn 1. Executing the approved action remains conditional on a response to `A`.

Observed: turn 1 executes its tool and stores `R`. The next step has no new user message. The [pending-input guard][guard] sees `A` and returns `unresolved`, without checking which turn owns the runnable work. The [harness parks][silent-park] without a model call, answer, or turn-completion event.

There are two additional paths:

1. **Partial-response replay also blocks text-only completion.** Approve A from a same-batch pair A/B while sending an unrelated message. The approval resolver queues A's response because B remains unanswered. Even if the model emits a complete text answer, [deferred input schedules another step][continuations]. The [approval resolver][partial] then sees the replayed partial response with no new message and parks. `message.completed` exists, but `turn.completed` and `settledTurn` do not. Changing only the empty-input guard will not cover this path.
2. **Completed coordination can close the turn without an answer.** A later turn requests a deferred workflow or runtime control. When its result arrives, the harness records the result, then the earlier approval blocks the model. A [special branch][coordination-park] emits `turn.completed` and `session.waiting`, but provides no answer or `settledTurn`. The [durable result mapper][settlement] consequently has no settled result to return. This is different from the silent ordinary-tool stall.

## Reproduced failure matrix

Every case below fails its desired-outcome assertion. Earlier approval requests stay pending; the probes do not clear them to manufacture progress.

| Scenario                                                                                                                                                    |  Cases | Observed failure                                                                                                                                                                   | Probe                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -----: | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Unrelated read, write, thrown tool error, parallel tools, invalid tool input, response-authorized approval                                                  |      6 | No model call after the result; no turn completion. The write counter increments before the stall. Invalid input is rejected without executing the tool.                           | [ordinary tools][ordinary-tests]                                                                         |
| Approve or cancel one independent batch while another stays open; answer a question while an approval stays open; accept an authenticated approval response |      4 | Resolution works; subsequent tool executes; its continuation stalls.                                                                                                               | [sibling approvals][sibling-tests], [question][question-test], [authenticated response][authorized-test] |
| Deferred workflow and runtime-control result delivery                                                                                                       |      2 | Result enters history; turn-completion events fire; no model interpretation or settled answer.                                                                                     | [coordination][coordination-tests]                                                                       |
| Multiple outstanding question batches, after the only approval is cancelled                                                                                 |      1 | An unrelated tool executes, then stalls despite no approval remaining.                                                                                                             | [questions only][questions-only-test]                                                                    |
| Partial approval response plus an unrelated tool turn or text-only turn                                                                                     |      2 | Deferred response blocks the continuation; the text-only case already emitted its answer.                                                                                          | [tool turn][partial-tool-test], [text turn][partial-text-test]                                           |
| Stale approval response converted into an ordinary follow-up                                                                                                |      1 | Follow-up tool executes, then stalls behind another approval.                                                                                                                      | [stale response][stale-test]                                                                             |
| Budget grant while an earlier approval remains                                                                                                              |      1 | Granted tool work executes; next step never reaches the new budget prompt. The assertion expects that prompt, not an answer beyond the budget.                                     | [budget][budget-test]                                                                                    |
| Background task admission receipt; provider-executed tool result                                                                                            |      2 | No continuation to acknowledge the receipt or interpret the result. Provider result remains in an assistant-role message, exercising the provider-specific continuation condition. | [background and provider][external-boundary-tests]                                                       |
| **Total**                                                                                                                                                   | **19** |                                                                                                                                                                                    |                                                                                                          |

## Passing controls and fix constraints

The 14 passing cases cover ordinary tools without pending input; text-only follow-up with a pending approval; resolving the sole approval; dismissing a sole question; workflow result without pending input; partial approvals delivered separately until the entire batch is answered; tool error and invalid-input rejection without pending input; settling multiple independent approvals plus deferred follow-up; a same-turn workflow/approval pair; budget renewal without the older approval; background admission and provider results without pending input; and `final_output` alongside an ordinary tool with an older approval.

These controls establish important boundaries:

- The same-turn workflow/approval pair must remain blocked until its own approval arrives. A blanket bypass whenever a turn is active is insufficient.
- Partial responses must remain recorded until their batch can resolve. Dropping deferred responses to force completion would lose user decisions.
- Session-limit prompts intentionally block further model calls. The budget case must reach the next prompt, not bypass the quota.
- `final_output` completes without another model step and succeeds with the earlier approval still pending.
- In all three actual [continuation conditions][continuations]—tool-role result, provider outcome, deferred input—pending state and runnable work must be distinguished.

## Evidence and reproduction

The [probe file][probe] uses the real harness and AI SDK `MockLanguageModelV4`. It scripts provider outputs. Approval and question batches are produced through actual model calls and harness parking, not inserted into session state. Local tool effects are in-memory counters. Workflow/control completion payloads and background admission receipts are supplied at their runtime boundaries; no real workflow or external write runs.

The probes run with the integration-tier configuration:

```sh
pnpm --filter eve exec vitest run --config vitest.integration.config.ts src/harness/issue-3494-adversarial.integration.test.ts
```

The original local audit recorded a subsequent 33/33 green run, but did not pin that result to a commit. Do not treat it as current-head validation. The suite has since grown. The [HITL coverage inventory](../e2e/fixtures/agent-tools-hitl/evals/hitl/continuation/README.md) distinguishes scripted E2E, selected-model E2E, and integration-only cases; [PR #3564](https://github.com/vercel/eve/pull/3564) records commit-specific validation. The original `/tmp` logs were local scratch artifacts, not durable reviewer evidence.

During probe development, two test assumptions were corrected before counting results: invalid-input coverage now uses a real Zod validator, and structured-output coverage initializes the harness session's output schema, matching the execution boundary. The budget assertion also explicitly expects the next budget prompt. These prevent unrelated fixture mistakes from being reported as additional defects.

## Remaining evidence boundaries

This pass covers all three immediate continuation conditions and both pending-input park exits reached by completed work. It is not exhaustive proof over every delivery race or provider.

| Not yet reproduced end to end                                | Why investigate next                                                                                                                                                      | Concrete verification                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Child-agent completion and delegated caller settlement       | Child results use pending coordination; absent `settledTurn` is significant to caller settlement. This is source-based inference, not a reproduced child-runtime failure. | Real child workflow plus earlier approval; assert result delivery, parent answer, and caller settlement independently.     |
| Background completion wakes                                  | Admission receipt is covered; later task completion and wake policy are separate transitions.                                                                             | Start actual task, leave approval open, complete task, verify wake eligibility and answer.                                 |
| OAuth authorization challenge completion                     | Response-authorized approvals are covered; external authorization challenge callbacks are separate machinery.                                                             | Park for auth alongside an earlier approval, deliver callback, verify retry and turn boundary.                             |
| Restart, replay, cancellation, and concurrent delivery races | These probes serialize the harness state transitions; they do not restart a durable world or race inbox entries.                                                          | CI durable-world evals with restart/replay and controlled delivery order; assert no duplicate writes and exact settlement. |
| Full live-provider and channel matrix                        | The original probes script provider streams. A later selected-model E2E pair covers the ordinary read; it does not cover every continuation or client.                    | Fixture-owned CI evals for representative ordinary, partial-response, and coordination failures.                           |

[guard]: https://github.com/vercel/eve/blob/52fe60f8af564a2c895bf4012f0f44df2beca915/packages/eve/src/harness/input-requests.ts#L99-L107
[silent-park]: https://github.com/vercel/eve/blob/52fe60f8af564a2c895bf4012f0f44df2beca915/packages/eve/src/harness/tool-loop.ts#L940
[partial]: https://github.com/vercel/eve/blob/52fe60f8af564a2c895bf4012f0f44df2beca915/packages/eve/src/harness/hitl/approval-input-requests.ts#L88-L105
[continuations]: https://github.com/vercel/eve/blob/52fe60f8af564a2c895bf4012f0f44df2beca915/packages/eve/src/harness/tool-loop.ts#L2880-L2894
[coordination-park]: https://github.com/vercel/eve/blob/52fe60f8af564a2c895bf4012f0f44df2beca915/packages/eve/src/harness/tool-loop.ts#L932-L937
[settlement]: https://github.com/vercel/eve/blob/52fe60f8af564a2c895bf4012f0f44df2beca915/packages/eve/src/execution/session/turn-step-result.ts#L59-L88
[probe]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts
[ordinary-tests]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts#L258
[sibling-tests]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts#L285
[question-test]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts#L300
[coordination-tests]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts#L312
[questions-only-test]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts#L325
[partial-tool-test]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts#L391
[stale-test]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts#L404
[budget-test]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts#L418
[partial-text-test]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts#L471
[external-boundary-tests]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts#L497
[authorized-test]: ../packages/eve/src/harness/issue-3494-adversarial.integration.test.ts#L537
