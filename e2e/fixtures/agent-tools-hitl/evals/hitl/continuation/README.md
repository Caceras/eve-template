# User-message continuation

Every accepted user message must reach its own answer, required input request, or explicit failure/cancellation. An older unanswered request cannot silently stop that message's work.

These evals exercise the real HTTP session, approval, tool, workflow, and event-stream paths. A deterministic model chooses the calls and constructs answers from the results it receives. There is no model judge and no manually seeded pending state. The sibling [`pending-approval-tool-followup.eval.ts`](../pending-approval-tool-followup.eval.ts) also exercises a live model.

These sessions explicitly select the scripted model with a fixture-only header. Other HITL evals keep the CI-selected model. The fixture has a one-million-output-token session limit; only the budget scripts report that much synthetic usage in one call.

Start with [`read.eval.ts`](./read.eval.ts): prepare a change, leave its approval pending, ask for a draft status, require the answer, then approve the original change. Every other regression follows that same conversation shape.

## Scenario syntax and classification

Each test body uses **Given / When / Then**: the actual pending state, the accepted user input, and the observable outcome. `defineEval.description` names the scenario. Native `tags` classify it by role (`regression` or `control`), triggering input (`user-message` or `input-response`), and behavior (`tool-result`, `tool-error`, `validation`, `workflow`, `provider-result`, `background-task`, `approval`, `authorization`, `question`, `partial-approval`, `stale-response`, `budget`, or `text-reply`). Every case also carries `hitl` and `continuation`.

The tags are filters, not expected verdicts: every case must pass after the runtime is fixed. In CI, `eve eval --tag regression`, `--tag control`, or `--tag partial-approval` selects the corresponding conversations. The body remains ordinary executable `defineEval` code; there is no separate scenario runner or generated assertion table.

## What makes a passing answer

[`expectReply`](./helpers.ts) requires both `message.completed` with the expected answer and `turn.completed`, attributed to the same turn. A tool result, an unrelated reply, or a completion event without an answer cannot pass. Approval-response cases verify resolution of the saved request and use the resumed `turn.started` ID; new messages use their own `message.received` ID. An input request may itself close a runtime turn, so `turn.completed` alone is never proof of an answer.

The eval saves each approval ID when it is first emitted. It does not infer durable pending state from the driver's latest-turn request list. After an unrelated answer, it checks that the old change has not executed. Most cases then approve the saved request and verify exactly one execution. The task-cancellation case stops after its answer, keeping subsequent background notifications outside that assertion.

## Conversations

Each link is one eval, with the user messages and expected outcome in the test body.

| While earlier input remains unanswered          | Expected current outcome                           | Eval                                                                 |
| ----------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| Read                                            | Report the returned status                         | [read](./read.eval.ts)                                               |
| Write                                           | Confirm exactly one write                          | [write](./write.eval.ts)                                             |
| Parallel read and write                         | Report both results                                | [parallel tools](./parallel-tools.eval.ts)                           |
| Tool throws                                     | Explain the actual error                           | [tool error](./tool-error.eval.ts)                                   |
| Invalid tool input                              | Correct the input and report the result            | [invalid input](./invalid-input.eval.ts)                             |
| Approval requires an authenticated responder    | Finish an unrelated read                           | [authorized pending](./authorized-pending.eval.ts)                   |
| Approve a separate change                       | Execute it, read, and reply                        | [approve sibling](./approve-sibling.eval.ts)                         |
| Cancel a separate change                        | Keep it unexecuted, read, and reply                | [cancel sibling](./cancel-sibling.eval.ts)                           |
| Authenticated approval of a separate change     | Settle authorization, read, and reply              | [authorized sibling](./authorized-sibling.eval.ts)                   |
| Answer a question                               | Continue that question's work and reply            | [answer question](./answer-question.eval.ts)                         |
| Workflow completes                              | Interpret its result                               | [workflow result](./workflow-result.eval.ts)                         |
| Runtime task control completes                  | Explain its result                                 | [runtime control](./runtime-control.eval.ts)                         |
| Background task starts                          | Acknowledge its working receipt                    | [background receipt](./background-receipt.eval.ts)                   |
| Provider executes a tool                        | Interpret the provider's result                    | [provider result](./provider-result.eval.ts)                         |
| Only multiple questions remain                  | Finish a new read without silently answering them  | [multiple questions](./multiple-questions.eval.ts)                   |
| One of two approvals is submitted               | Finish a new tool request                          | [partial approval, tool](./partial-approval-tool.eval.ts)            |
| One of two approvals is submitted               | Finish a new text-only request                     | [partial approval, text](./partial-approval-text.eval.ts)            |
| User repeats a resolved approval response       | Process the new input without authorizing old work | [stale response](./stale-response.eval.ts)                           |
| User grants another budget window               | Run the tool and ask for the next needed grant     | [budget grant](./budget-grant.eval.ts)                               |
| Two approvals are answered in separate requests | Resolve both and reply                             | [separate approval responses](./separate-approval-responses.eval.ts) |

Fourteen `*.control.eval.ts` conversations cover the same tool paths without an older approval, text-only replies, resolving the only approval, approving both calls together, and preserving a same-turn approval beside a workflow.

## Boundaries

Partial approvals travel as a real accepted HTTP response followed by a separate user message; the API rejects combined message/response payloads. The provider case adds a provider-executed result at the model stream boundary, rather than faking a local tool return. Background coverage stops at admission and acknowledgement; it does not establish background completion or wake correctness. Runtime control cancels an actual background task using its returned task ID. The budget case expects another input request, because its granted window cannot pay for the final answer.

Run these evals in the repository's CI E2E suites. Keep the runtime unchanged until the failing cases and passing controls have been inspected. A timeout proves a missing boundary only when the captured trace also proves the intended setup and tool path ran. A fixture error is not a runtime regression.
