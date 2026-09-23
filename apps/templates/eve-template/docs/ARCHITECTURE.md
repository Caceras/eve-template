# Architecture

## Principle

Ægentica is a product shell over eve, not a second runtime.

```text
Next.js product shell
├── persisted chats/auth/storage       ← official eve-chat-template
├── native Web Chat reference          ← current registry channel/web scaffold
├── capability inspector               ← Eve Client.info() agent-info v4
└── registry browser                   ← current apps/docs/registry.json

Eve runtime
├── sessions / durable stream
├── model loop / compaction / limits
├── tools / approvals / questions
├── state / memory / sandbox
├── workflows / tasks / schedules
├── subagents / remote agents
├── connections / channels / extensions
├── hooks / instrumentation
└── evals
```

## Product layer

What Ægentica adds on top of the chat template, all in the Next.js app and
`lib/`, with eve doing the agent work:

```text
Browser (web and installed PWA)
  │  /eve/v1/*  (withEve proxy)          /api/settings/*  (operator-only)
  ▼                                       ▼
Next.js :3000 ─────────────────────► lib/ settings, stores, handlers
  │                                        │
  │ same volume (.eve/.workflow-data)      │
  ▼                                        ▼
eve runtime 127.0.0.1:4274          chats.sqlite · profile.sqlite · settings/*.enc
  ├─ channels: eve (web), telegram
  ├─ memory: profile (fileMemory, SQLite backend)
  ├─ extensions: github (github-tools)
  ├─ schedules: scheduled-tasks (1-minute dispatcher) → lib/task-runner.ts
  └─ routed model: AI Gateway or OpenRouter, per step
```

| Concern       | Where                                                                               | Notes                                                        |
| ------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Chat history  | `lib/db/queries.ts` → `sqlite-queries.ts` or `pg-queries.ts`                        | SQLite in password mode, Postgres when `DATABASE_URL` is set |
| Settings      | `lib/secure-settings.ts` + `lib/*-settings*.ts`                                     | AES-256-GCM files; `handleOperatorSettings` guards every API |
| Models        | `lib/provider-settings.ts`, `agent/lib/routed-model.ts`                             | Provider and model resolved at each step                     |
| Tasks         | `lib/schedule-store.ts`, `agent/schedules/scheduled-tasks.ts`, `lib/task-runner.ts` | Leased dispatch, each run is an eve session saved as a chat  |
| Notifications | `lib/push-notifications.ts`, `public/sw.js`                                         | Web Push with server-generated VAPID keys                    |
| Memory page   | `lib/memory-store.ts`, `agent/memory/profile.ts`                                    | Edits eve's fileMemory document in its own format            |
| GitHub        | `agent/extensions/github.ts`, `lib/github-settings.ts`                              | Official extension; token read per call                      |
| Telegram      | `agent/channels/telegram.ts`, `lib/telegram-settings.ts`                            | Owner-only, paired from Settings                             |

The scheduler uses eve's dynamic-scheduling and outbox patterns: rows are
leased under a lock, work is at least once, and a failed hand-off retries.
The task runner calls the local eve API with an internal HMAC token
(`lib/internal-auth.ts`) that authenticates it as the operator.

## Two chat surfaces, one eve runtime

The persisted root chat keeps the richer Chat Template product behavior: auth, thread history, database/browser persistence, connection toggles, and durable session cursors.

`/native` embeds the current official `channel/web` scaffold as a reference surface. It is intentionally close to registry source so changes in Eve's recommended rendering model are easy to compare and absorb.

Both use Eve's HTTP/session protocol; neither invents a second event schema.

## Context layout

The reference agent follows Eve's context-control guidance:

- stable identity and constraints → `instructions.md`
- optional procedures → `skills/`
- durable short-term working state → `defineState`
- cross-session recall → Eve memory provider
- files and larger runtime context → sandbox `/workspace`
- typed external actions → tools/connections
- specialized prompts/capabilities → subagents
- caller/session dependent surfaces → `defineDynamic`

The goal is to keep the model-facing context minimal while leaving capabilities discoverable.

## Capability truth

There are two distinct inventories:

1. **Effective runtime** — `Client.info()` returns the compiled agent-info v4: tools, skills, connections, channels, memory slots, hooks, schedules, subagents, sandbox, composition history, and dynamic resolvers.
2. **Official installable ecosystem** — `scripts/sync-eve-surface.mjs` snapshots the current `apps/docs/registry.json` and package export map into `lib/eve-surface.generated.ts`.

The UI labels these separately so “available in Eve” never gets confused with “currently active in this agent session.”

## Defaults versus examples

Eve already supplies a default sandbox, built-in tools, compaction, local tracing, and deployment tracing. The template avoids authored files that merely duplicate those defaults.

Reference files are added where they demonstrate a separate concept:

- opt-in `glob`, `grep`, `sleep`
- `agentRouter()` composition
- explicit approval
- `defineState`
- blocking/background workflow tools
- declared and hidden subagents
- packaged/dynamic skills
- schedule/hook
- OpenAPI/custom/MCP channel examples

## Integrations

The capabilities UI exposes the entire official registry. Credentials are not required merely to clone the template. Users opt into a provider with Eve's own `eve add` and setup flows.

This keeps the base clone runnable while still making all official integrations visible.
