# Eve feature matrix

This matrix is the coverage contract for the Ultimate Eve Template. “Included” means the generated template contains a runnable example. Only the live Agent overview may report “Active”, after runtime inspection; a declaration does not prove an integration is connected or tested. “Built in” means Eve supplies the behavior without authored replacement code. “Surfaced” means the UI exposes the effective/runtime or official registry capability. “Reference” means the docs/UI point to the official capability without activating credentials or an unsafe integration by default.

## Core runtime and client

| Capability | Coverage | Implementation |
| --- | --- | --- |
| Durable sessions / turns / steps | Built in + surfaced | `useEveAgent`, Eve HTTP channel |
| Streaming + reconnect / rewind | Built in | official Chat Template and Web Chat |
| Session prewarm | Reference | Eve React/client API |
| Steering active turns | Built in | current `channel/web` scaffold |
| Cancellation | Built in + UI | both chat surfaces |
| Compact context | Built in / reference | Eve session API |
| Clear context | Built in / reference | Eve session API |
| Reset session | Built in / reference | Eve session API |
| Structured output schema | Reference | `defineAgent.outputSchema` / per-turn client schema |
| Compaction | Included | `agent/agent.ts`, threshold 0.8 |
| Session token budgets | Included | `agent/agent.ts` |
| Session cost budget | Included | `agent/agent.ts` |
| Session timeout | Included | `agent/agent.ts` |
| Workflow world selection | Reference | official docs, self-host/Vercel options |
| Workflow checkpoint batching | Reference / experimental | official `defineAgent.experimental.workflow` |
| Run retention | Reference / experimental | official `defineAgent.experimental.workflow.retention` |
| Gateway model | Included | root/subagent configs |
| direct OpenAI / Anthropic | Reference | public model helpers |
| local ChatGPT subscription | Reference | `chatgpt()` local-only helper |
| automatic model selection | Reference | `auto()` |
| dynamic model selection | Reference | `defineDynamic` |
| reasoning effort | Included | root and subagents |
| provider model options | Reference | public agent config |

## Context and authoring

| Capability | Coverage | Implementation |
| --- | --- | --- |
| Markdown instructions | Included | `agent/instructions.md` |
| TypeScript instructions | Reference | official API/docs |
| system/user instruction roles | Reference | official API/docs |
| dynamic instructions | Included | `instructions/runtime.ts` |
| flat skill | Inherited | Chat Template `plan_a_trip` |
| packaged skill + resources | Included | `skills/deep-research/` |
| dynamic skill | Included | `skills/caller-note.ts` |
| `load_skill` | Built in | Eve default harness |
| durable per-session state | Included | `defineState` + `session_counter` |
| cross-session memory | Included | Chat Template profile memory |
| memory scoping | Included | Chat Template memory implementation |
| custom memory provider | Reference | official memory provider contract |
| File Memory | Included / base template | official Eve provider |
| Supermemory | Surfaced | official registry |
| Upstash AgentKit | Surfaced | official registry |
| Arcana | Surfaced | official registry |

## Tools and HITL

| Capability | Coverage | Implementation |
| --- | --- | --- |
| `bash` | Built in + surfaced | Eve default |
| `read_file` | Built in + surfaced | Eve default |
| `write_file` | Included override | official definition + `always()` |
| `web_fetch` | Built in + surfaced | Eve default |
| `web_search` | Built in + surfaced | Eve default |
| `todo` | Built in + surfaced | Eve default |
| `ask_question` | Built in + native UI | Eve default + current Web Chat |
| root-copy `agent` | Runtime target | routed through `agentRouter()` |
| `task_cancel` | Built in + surfaced | Eve default |
| `connection_search` | Built in when connections exist | Eve default |
| `glob` | Included opt-in | official definition |
| `grep` | Included opt-in | official definition |
| `sleep` | Included opt-in | official durable definition |
| typed `defineTool` | Included | `session_counter`, `confirm_demo` |
| dynamic tool | Included | `dynamic_context.ts` |
| labels / progress / model projection | Reference | official tool API + Web Chat renderer |
| `availableInSubagents` | Included indirectly | `agentRouter()`/official behavior |
| `always()` approval | Included | `confirm_demo`, `write_file` |
| `once()` / `never()` / `auto()` approval | Reference | public approval API |
| questions | Included/built in | `ask_question`, workflow `ctx.ask()` |
| connection authorization | Built in + native UI | official connection lifecycle |
| session limit input | Built in | Eve limits lifecycle |
| durable callback/schema | Reference | provider-package dynamic capability API |

## Sandbox and files

| Capability | Coverage | Implementation |
| --- | --- | --- |
| framework default sandbox | Built in | intentionally not replaced |
| seeded `/workspace` | Included | `sandbox/workspace/eve-template.md` |
| inbound attachments | Included | Eve channel upload policy + current Web Chat |
| sandbox read/write/bash | Built in | Eve tools |
| sandbox stop/delete lifecycle | Reference | public sandbox handle |
| Docker backend | Reference | official backend |
| just-bash backend | Reference | official backend |
| microsandbox backend | Reference | official backend |
| Vercel Sandbox backend | Reference | official backend |
| network policy | Reference | `defineSandbox` API |
| child shares parent sandbox | Reference | `defineSandbox(parent => parent.sandbox)` |

## Workflows and tasks

| Capability | Coverage | Implementation |
| --- | --- | --- |
| blocking workflow tool | Included | `confirm_then_research` |
| background workflow tool | Included | `background_review` |
| `ctx.ask()` | Included | `confirm_then_research` |
| `ctx.agent()` | Included | both workflow tools |
| `ctx.agents` | Used by official router | `agentRouter()` |
| workflow progress/yield | Reference | official API |
| durable timers/sleep | Included opt-in tool + reference workflow API | Eve Workflow |
| webhooks/hooks in Workflow | Reference | official Workflow SDK integration |
| cancellation / abort signal | Reference | official workflow tool context |
| runtime-generated workflow program | Included | `tools/workflow.ts` |
| background task receipts/outcomes | Included | `background_review` |

## Subagents

| Capability | Coverage | Implementation |
| --- | --- | --- |
| built-in root copy | Built in / router target | Eve root target |
| declared visible subagent | Included | `researcher` |
| hidden `tool:false` subagent | Included | `reviewer` |
| `agentRouter()` | Included | `tools/agent.ts` |
| persistent child sessions / `agentId` | Built in | Eve runtime |
| child steering / continuation | Built in / reference UI | Eve runtime |
| child task cancellation | Built in | `task_cancel` |
| dynamic subagent | Included, caller-gated | `subagents/conditional-helper/` |
| nested subagents | Reference | official filesystem model |
| remote agents | Reference + surfaced in agent-info | `defineRemoteAgent` |
| structured child output | Reference | child `outputSchema` |

## Connections and auth

| Capability | Coverage | Implementation |
| --- | --- | --- |
| MCP connection | Included from Chat Template | Linear/Notion/Sentry examples |
| OpenAPI connection | Included | public Petstore example |
| dynamic connection | Included | `connections/dynamic-petstore.ts` |
| static bearer/token auth | Reference | connection API |
| per-caller auth/headers | Reference | connection API |
| Vercel Connect OAuth | Included from Chat Template | official connector patterns |
| provided arguments / idempotency call ID | Reference | MCP/OpenAPI API |
| connection filters | Reference | MCP/OpenAPI API |
| per-connection approval | Reference | MCP/OpenAPI API |
| interactive authorization | Built in + native UI | Eve connection lifecycle |
| official connection registry | Surfaced | generated from registry |

## Channels

| Capability | Coverage | Implementation |
| --- | --- | --- |
| Eve HTTP channel | Included | Chat Template channel |
| Web Chat | Included x2 | persisted shell + current registry scaffold |
| Slack | Included/configurable | Chat Template |
| MCP server channel | Included local-only | `channels/mcp.ts` |
| custom HTTP channel | Included but token-disabled by default | `channels/demo.ts` |
| cross-channel handoff | Reference | custom-channel API |
| audience / trace policy | Reference | channels + instrumentation docs |
| GitHub / Linear native channels | Surfaced | official registry |
| Discord / Teams / Telegram / Twilio | Surfaced | official registry |
| Chat SDK adapters (Beeper, Gmail, WhatsApp, X, Messenger, etc.) | Surfaced | official registry |
| proactive sessions / attachments / HITL | Reference | platform channel docs |

## Scheduling, hooks, extensions, observability

| Capability | Coverage | Implementation |
| --- | --- | --- |
| static TypeScript schedule | Included | `schedules/heartbeat.ts` |
| Markdown schedule | Reference | official scheduler syntax |
| handler schedule | Reference | official scheduler syntax |
| dynamic scheduling pattern | Reference | official DB dispatcher pattern |
| global lifecycle hook | Included | `hooks/audit.ts` |
| channel-specific event handlers | Inherited/reference | official channel behavior |
| Extensions | Surfaced + reference | official registry / `defineExtension` |
| extension override/disable | Demonstrated conceptually | `write_file` mirrors override composition |
| self-modification extension | Surfaced / optional | official `eve/self-modification` registry item |
| local traces | Built in | Eve dev default |
| Vercel Agent Runs | Built in on supported deployment | Eve deployment default |
| OTel configuration/destinations | Surfaced / reference | official registry + API |
| lifecycle instrumentation | Reference | `defineInstrumentation` |
| trace redaction/export policy | Reference | official OTEL API |

## Evals, protocols, developer tooling

| Capability | Coverage | Implementation |
| --- | --- | --- |
| `defineEval` | Included | `evals/**` |
| multi-turn eval | Included | HITL/workflow evals |
| input request driving | Included | `requireInputRequest`, `respondAll` |
| deterministic assertions | Included | behavior assertions |
| `t.judge()` | Reference | official current API |
| `mockModel` | Reference | official current API |
| reporters / datasets / loaders | Reference | official eval APIs |
| Eve Client SDK | Included | Chat Template + capability inspector |
| React `useEveAgent` | Included | both chat surfaces |
| Vue / Svelte bindings | Reference | public package exports |
| Next / Nuxt / SvelteKit adapters | Reference | public package exports |
| `eve init`, `eve add`, registry CLI | Reference + registry UI | official CLI |
| local dev capability | Reference | `eve/local-dev` |
| MCP channel protocol | Included local-only | `channels/mcp.ts` |
| ACP | Reference | official protocol docs |
| UCP | Reference | official protocol docs |

## Drift guard

The generated surface file records every current public package export and official registry item. CI should run `pnpm eve:surface:check` after upstream changes. A diff means this matrix and/or UI should be reviewed before calling the template current.
