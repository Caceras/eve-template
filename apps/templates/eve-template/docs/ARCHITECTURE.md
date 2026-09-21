# Architecture

## Principle

The app is a product shell over Eve, not a second runtime.

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

## Two chat surfaces, one Eve runtime

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
