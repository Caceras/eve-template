# Eve feature matrix

This matrix is the coverage contract for the Ultimate Eve Template. “Included” means the generated template contains a runnable example. Only the live Agent overview may report “Active”, after runtime inspection; a declaration does not prove an integration is connected or tested. “Built in” means Eve supplies the behavior without authored replacement code. “Surfaced” means the UI exposes the effective/runtime or official registry capability. “Reference” means the docs/UI point to the official capability without activating credentials or an unsafe integration by default.

## Core runtime and client

| Capability                         | Coverage                 | Implementation                                                  |
| ---------------------------------- | ------------------------ | --------------------------------------------------------------- |
| Durable sessions / turns / steps   | Built in + surfaced      | `useEveAgent`, Eve HTTP channel                                 |
| Streaming + reconnect / rewind     | Built in                 | official Chat Template and Web Chat                             |
| Session prewarm                    | Reference                | Eve React/client API                                            |
| Steering active turns              | Built in                 | current `channel/web` scaffold                                  |
| Cancellation                       | Built in + UI            | both chat surfaces                                              |
| Compact context                    | Built in / reference     | Eve session API                                                 |
| Clear context                      | Built in / reference     | Eve session API                                                 |
| Reset session                      | Built in / reference     | Eve session API                                                 |
| Structured output schema           | Reference                | `defineAgent.outputSchema` / per-turn client schema             |
| Compaction                         | Included                 | `agent/agent.ts`, threshold 0.8                                 |
| Session token budgets              | Included                 | `agent/agent.ts`                                                |
| Session cost budget                | Included                 | `agent/agent.ts`                                                |
| Session timeout                    | Included                 | `agent/agent.ts`                                                |
| Workflow world selection           | Reference                | official docs, self-host/Vercel options                         |
| Workflow checkpoint batching       | Reference / experimental | official `defineAgent.experimental.workflow`                    |
| Run retention                      | Reference / experimental | official `defineAgent.experimental.workflow.retention`          |
| Gateway model                      | Active                   | `agent/lib/routed-model.ts`, AI Gateway key in Settings         |
| OpenRouter model (AI SDK provider) | Active                   | `agent/lib/routed-model.ts`, OpenRouter key in Settings         |
| direct OpenAI / Anthropic          | Reference                | public model helpers                                            |
| local ChatGPT subscription         | Reference                | `chatgpt()` local-only helper                                   |
| automatic model selection          | Reference                | `auto()`                                                        |
| dynamic model selection            | Active                   | `defineDynamic` `step.started` in root, researcher and reviewer |
| reasoning effort                   | Included                 | root and subagents                                              |
| provider model options             | Reference                | public agent config                                             |

## Context and authoring

| Capability                         | Coverage           | Implementation                                                                                                               |
| ---------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Markdown instructions              | Included           | `agent/instructions.md`                                                                                                      |
| TypeScript instructions            | Reference          | official API/docs                                                                                                            |
| system/user instruction roles      | Reference          | official API/docs                                                                                                            |
| dynamic instructions               | Included           | `instructions/runtime.ts`                                                                                                    |
| turn-scoped user-role instructions | Active             | `instructions/clock.ts` (current time)                                                                                       |
| flat skill                         | Inherited + Active | Chat Template `plan_a_trip`, `daily-briefing.md`                                                                             |
| packaged skill + resources         | Active             | `skills/deep-research/`, `review-a-pull-request/`, `investigate-a-failing-check/`, `research-a-question/` (ported from sol0) |
| dynamic skill                      | Included           | `skills/caller-note.ts`                                                                                                      |
| `load_skill`                       | Built in           | Eve default harness                                                                                                          |
| durable per-session state          | Included           | `defineState` + `session_counter`                                                                                            |
| cross-session memory               | Active             | `memory/profile.ts`, fileMemory on a SQLite backend; Memory page edits the same document                                     |
| memory scoping                     | Active             | operator scope shared by web, Telegram and schedules                                                                         |
| custom memory provider             | Reference          | official memory provider contract                                                                                            |
| File Memory                        | Active             | official eve provider with `agent/lib/durable-memory.ts` backend                                                             |
| Supermemory                        | Surfaced           | official registry                                                                                                            |
| Upstash AgentKit                   | Surfaced           | official registry                                                                                                            |
| Arcana                             | Surfaced           | official registry                                                                                                            |

## Tools and HITL

| Capability                                | Coverage                        | Implementation                                                                          |
| ----------------------------------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| `bash`                                    | Built in + surfaced             | Eve default                                                                             |
| `read_file`                               | Built in + surfaced             | Eve default                                                                             |
| `write_file`                              | Included override               | official definition + `always()`                                                        |
| `web_fetch`                               | Built in + surfaced             | Eve default                                                                             |
| `web_search`                              | Built in + surfaced             | Eve default                                                                             |
| `generate_image` (AI SDK `generateImage`) | Active                          | `tools/generate_image.ts`, active provider, images kept on the volume and shown in chat |
| `todo`                                    | Built in + surfaced             | Eve default                                                                             |
| `ask_question`                            | Built in + native UI            | Eve default + current Web Chat                                                          |
| root-copy `agent`                         | Runtime target                  | routed through `agentRouter()`                                                          |
| `task_cancel`                             | Built in + surfaced             | Eve default                                                                             |
| `connection_search`                       | Built in when connections exist | Eve default                                                                             |
| `glob`                                    | Included opt-in                 | official definition                                                                     |
| `grep`                                    | Included opt-in                 | official definition                                                                     |
| `sleep`                                   | Included opt-in                 | official durable definition                                                             |
| typed `defineTool`                        | Included                        | `session_counter`, `confirm_demo`                                                       |
| dynamic tool                              | Included                        | `dynamic_context.ts`                                                                    |
| labels / progress / model projection      | Reference                       | official tool API + Web Chat renderer                                                   |
| `availableInSubagents`                    | Included indirectly             | `agentRouter()`/official behavior                                                       |
| `always()` approval                       | Included                        | `confirm_demo`, `write_file`                                                            |
| custom approval policy                    | Active                          | `lib/operator-only.ts` on scheduled-task tools                                          |
| `once()` / `never()` / `auto()` approval  | Reference                       | public approval API                                                                     |
| questions                                 | Included/built in               | `ask_question`, workflow `ctx.ask()`                                                    |
| connection authorization                  | Built in + native UI            | official connection lifecycle                                                           |
| session limit input                       | Built in                        | Eve limits lifecycle                                                                    |
| durable callback/schema                   | Reference                       | provider-package dynamic capability API                                                 |

## Sandbox and files

| Capability                    | Coverage  | Implementation                               |
| ----------------------------- | --------- | -------------------------------------------- |
| framework default sandbox     | Built in  | intentionally not replaced                   |
| seeded `/workspace`           | Included  | `sandbox/workspace/eve-template.md`          |
| inbound attachments           | Included  | Eve channel upload policy + current Web Chat |
| sandbox read/write/bash       | Built in  | Eve tools                                    |
| sandbox stop/delete lifecycle | Reference | public sandbox handle                        |
| Docker backend                | Reference | official backend                             |
| just-bash backend             | Reference | official backend                             |
| microsandbox backend          | Reference | official backend                             |
| Vercel Sandbox backend        | Reference | official backend                             |
| network policy                | Reference | `defineSandbox` API                          |
| child shares parent sandbox   | Reference | `defineSandbox(parent => parent.sandbox)`    |

## Workflows and tasks

| Capability                         | Coverage                                      | Implementation                    |
| ---------------------------------- | --------------------------------------------- | --------------------------------- |
| blocking workflow tool             | Included                                      | `confirm_then_research`           |
| background workflow tool           | Included                                      | `background_review`               |
| `ctx.ask()`                        | Included                                      | `confirm_then_research`           |
| `ctx.agent()`                      | Included                                      | both workflow tools               |
| `ctx.agents`                       | Used by official router                       | `agentRouter()`                   |
| workflow progress/yield            | Reference                                     | official API                      |
| durable timers/sleep               | Included opt-in tool + reference workflow API | Eve Workflow                      |
| webhooks/hooks in Workflow         | Reference                                     | official Workflow SDK integration |
| cancellation / abort signal        | Reference                                     | official workflow tool context    |
| runtime-generated workflow program | Included                                      | `tools/workflow.ts`               |
| background task receipts/outcomes  | Included                                      | `background_review`               |

## Subagents

| Capability                            | Coverage                           | Implementation                  |
| ------------------------------------- | ---------------------------------- | ------------------------------- |
| built-in root copy                    | Built in / router target           | Eve root target                 |
| declared visible subagent             | Included                           | `researcher`                    |
| hidden `tool:false` subagent          | Included                           | `reviewer`                      |
| `agentRouter()`                       | Included                           | `tools/agent.ts`                |
| persistent child sessions / `agentId` | Built in                           | Eve runtime                     |
| child steering / continuation         | Built in / reference UI            | Eve runtime                     |
| child task cancellation               | Built in                           | `task_cancel`                   |
| dynamic subagent                      | Included, caller-gated             | `subagents/conditional-helper/` |
| nested subagents                      | Reference                          | official filesystem model       |
| remote agents                         | Reference + surfaced in agent-info | `defineRemoteAgent`             |
| structured child output               | Reference                          | child `outputSchema`            |

## Connections and auth

| Capability                               | Coverage                    | Implementation                    |
| ---------------------------------------- | --------------------------- | --------------------------------- |
| MCP connection                           | Included from Chat Template | Linear/Notion/Sentry examples     |
| OpenAPI connection                       | Included                    | public Petstore example           |
| dynamic connection                       | Included                    | `connections/dynamic-petstore.ts` |
| static bearer/token auth                 | Reference                   | connection API                    |
| per-caller auth/headers                  | Reference                   | connection API                    |
| Vercel Connect OAuth                     | Included from Chat Template | official connector patterns       |
| provided arguments / idempotency call ID | Reference                   | MCP/OpenAPI API                   |
| connection filters                       | Reference                   | MCP/OpenAPI API                   |
| per-connection approval                  | Reference                   | MCP/OpenAPI API                   |
| interactive authorization                | Built in + native UI        | Eve connection lifecycle          |
| official connection registry             | Surfaced                    | generated from registry           |

## Channels

| Capability                                                      | Coverage                               | Implementation                                                                            |
| --------------------------------------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------- |
| Eve HTTP channel                                                | Included                               | Chat Template channel                                                                     |
| Web Chat                                                        | Included x2                            | persisted shell + current registry scaffold                                               |
| installable app (PWA) + Web Push                                | Active                                 | `app/manifest.ts`, `public/sw.js`, Settings → Notifications                         |
| Slack                                                           | Included/configurable                  | Chat Template                                                                             |
| MCP server channel                                              | Included local-only                    | `channels/mcp.ts`                                                                         |
| custom HTTP channel                                             | Included but token-disabled by default | `channels/demo.ts`                                                                        |
| cross-channel handoff                                           | Reference                              | custom-channel API                                                                        |
| audience / trace policy                                         | Reference                              | channels + instrumentation docs                                                           |
| GitHub / Linear native channels                                 | Surfaced                               | official registry                                                                         |
| Telegram                                                        | Active when connected                  | `channels/telegram.ts`, owner-only, paired from Settings                                  |
| Discord / Teams / Twilio                                        | Surfaced                               | official registry                                                                         |
| Chat SDK adapters (Beeper, Gmail, WhatsApp, X, Messenger, etc.) | Surfaced                               | official registry                                                                         |
| proactive sessions / attachments / HITL                         | Active (web + Telegram)                | scheduled runs saved as web chats + Web Push; Telegram uploads, inline-keyboard approvals |

## Scheduling, hooks, extensions, observability

| Capability                      | Coverage                         | Implementation                                                                                                                        |
| ------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| static TypeScript schedule      | Included                         | `schedules/heartbeat.ts`                                                                                                              |
| handler schedule                | Active                           | `schedules/scheduled-tasks.ts`, one-minute dispatcher                                                                                 |
| dynamic scheduling pattern      | Active                           | `/tasks` page + `schedule_task` tools + `lib/schedule-store.ts`; each run is an eve session saved as a web chat, notified by Web Push |
| Markdown schedule               | Reference                        | official scheduler syntax                                                                                                             |
| global lifecycle hook           | Included                         | `hooks/audit.ts`                                                                                                                      |
| channel-specific event handlers | Inherited/reference              | official channel behavior                                                                                                             |
| Extensions                      | Active + surfaced                | `extensions/github.ts` mounts the registry's `@github-tools/eve-extension`; the rest of the registry is surfaced                      |
| extension override/disable      | Demonstrated conceptually        | `write_file` mirrors override composition                                                                                             |
| self-modification extension     | Surfaced / optional              | official `eve/self-modification` registry item                                                                                        |
| local traces                    | Built in                         | Eve dev default                                                                                                                       |
| Vercel Agent Runs               | Built in on supported deployment | Eve deployment default                                                                                                                |
| OTel configuration/destinations | Surfaced / reference             | official registry + API                                                                                                               |
| lifecycle instrumentation       | Reference                        | `defineInstrumentation`                                                                                                               |
| trace redaction/export policy   | Reference                        | official OTEL API                                                                                                                     |

## Evals, protocols, developer tooling

| Capability                          | Coverage                | Implementation                       |
| ----------------------------------- | ----------------------- | ------------------------------------ |
| `defineEval`                        | Included                | `evals/**`                           |
| multi-turn eval                     | Included                | HITL/workflow evals                  |
| input request driving               | Included                | `requireInputRequest`, `respondAll`  |
| deterministic assertions            | Included                | behavior assertions                  |
| `t.judge()`                         | Reference               | official current API                 |
| `mockModel`                         | Reference               | official current API                 |
| reporters / datasets / loaders      | Reference               | official eval APIs                   |
| Eve Client SDK                      | Included                | Chat Template + capability inspector |
| React `useEveAgent`                 | Included                | both chat surfaces                   |
| Vue / Svelte bindings               | Reference               | public package exports               |
| Next / Nuxt / SvelteKit adapters    | Reference               | public package exports               |
| `eve init`, `eve add`, registry CLI | Reference + registry UI | official CLI                         |
| local dev capability                | Reference               | `eve/local-dev`                      |
| MCP channel protocol                | Included local-only     | `channels/mcp.ts`                    |
| ACP                                 | Reference               | official protocol docs               |
| UCP                                 | Reference               | official protocol docs               |

## Drift guard

The generated surface file records every current public package export and official registry item. CI should run `pnpm eve:surface:check` after upstream changes. A diff means this matrix and/or UI should be reviewed before calling the template current.

## Operator product surfaces

| Capability                              | Coverage                                  | Boundary                                                            |
| --------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------- |
| Saved agents                            | Implemented in `/agents`                  | 64 encrypted operator profiles; not separate tenants or deployments |
| Profile instructions and reference text | Dynamic user-role context                 | No permission grants or retrieval index                             |
| Profile model / reasoning choice        | Main chat through existing router         | The active provider must support the model                          |
| Profile creation in chat                | `create_saved_agent`, approval required   | Operator only; editing remains in the form                          |
| Saved-profile delegation                | Background eve workflow                   | Compiled researcher, current conversation model                     |
| Main-chat files                         | Structured eve client content             | Four files / 6 MB; unsent drafts stay on this device                |
| Chat / Research / Image                 | Per-turn composer intent                  | One runtime; generation requires working credentials                |
| Image library                           | Authenticated `/images`                   | Existing volume; bounded scan, confirmed deletion                   |
| Global command search                   | Cmd/Ctrl+K                                | Shared pages/actions and up to 100 recent chats                     |
| Capability directory                    | Searchable Live / Built in / Explore | Declarations and registry availability are not connection tests     |

Real execution remains unverified until a working model key is supplied and live turns complete. Runtime is the source of truth for effective capabilities; static entries in this matrix cannot assert credential success.

The primary persisted composer also exposes Eve's documented active-turn steering (`turnPolicy: "steer"`) while retaining durable cancellation. The AI Elements Live session remains an advanced surface rather than a duplicate sidebar destination.
