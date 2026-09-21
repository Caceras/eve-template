# Eve Template

The comprehensive reference template for [Vercel Eve](https://eve.dev), built from Eve's own source tree and official scaffolding.

This template starts with `apps/templates/eve-chat-template`, keeps its persisted Next.js chat, authentication, storage, connections, and session handling, then layers in the current public Eve surface from the same checkout. The current `channel/web` registry scaffold supplies the native Eve message renderer and AI Elements. Framework defaults remain defaults unless an override is required to demonstrate a feature.

## What this template demonstrates

- Durable sessions, streaming, reconnect, steering, cancellation, compact/clear/reset semantics
- Static and dynamic instructions, packaged and dynamic skills
- Built-in tools plus opt-in `glob`, `grep`, and durable `sleep`
- Explicit tool approval and durable human input
- `defineState` durable session state
- First-class Eve memory via the Chat Template's profile memory
- Default sandbox plus seeded `/workspace` content and attachments
- Declared visible/hidden subagents, `agentRouter()`, continuation/task lifecycle
- Blocking and background `defineWorkflowTool()` flows using `ctx.ask()` and `ctx.agent()`
- Static schedules and lifecycle hooks
- OpenAPI connections, the Chat Template's MCP/Vercel Connect examples, and dynamic capability patterns
- Eve HTTP channel, local-only MCP channel, Slack from the base template, and a minimal custom channel
- Current Web Chat scaffold side-by-side with the persisted Chat Template shell
- Eve agent-info v4 capability inspection
- The entire current official Eve registry surfaced in the UI
- Eve evals for state, approval, workflow HITL, and delegation
- Official instrumentation defaults (local traces in development, Agent Runs on Vercel)
- Optional official self-modification and third-party integrations documented rather than silently enabled

## Source-of-truth order

When official Eve examples disagree, this template follows:

1. `packages/eve` public exports and implementation
2. current `docs/`
3. current `apps/docs/registry/`
4. current `e2e/` fixtures and tests
5. current `apps/frameworks/`
6. current `apps/templates/`
7. Vercel Labs showcase templates

See [`docs/UPSTREAM.md`](./docs/UPSTREAM.md).

## Materialize inside the Eve monorepo

From the root of a checkout or fork of `vercel/eve`:

```bash
node /path/to/eve-template-overlay/scripts/materialize-eve-template.mjs .
cd apps/templates/eve-template
pnpm install
pnpm typecheck
pnpm build:eve
pnpm build
pnpm eval
```

The generator deliberately removes the copied Chat Template lockfile because the generated app is synchronized to the Eve version in the current checkout and may have a different dependency graph.

## Reference surfaces

- `/` — persisted Chat Template experience
- `/capabilities` — Agent: live runtime, included scaffolds, and the official installable Eve surface
- `/native` — Web: current official `channel/web` scaffold using `useEveAgent`
- `/session` — Sessions: inspect and control durable Eve sessions

The Agent page separates three truths: **Active** capabilities from `Client.info()` (agent-info v4), **Included** scaffolds present in this repo, and **Available** official integrations generated from `apps/docs/registry.json`.

## Security defaults

The template is comprehensive without making unsafe capabilities globally permissive:

- the custom demo channel is disabled unless `EVE_TEMPLATE_DEMO_CHANNEL_TOKEN` is set;
- the MCP channel uses `localDev()` and therefore rejects production requests;
- `write_file` retains Eve's official implementation but is overridden with `always()` approval;
- the harmless approval demo also uses `always()`;
- self-modification is documented as an official optional integration and is not installed automatically;
- third-party registry integrations are visible but not activated without credentials/setup.

## Keeping the template complete

`pnpm eve:surface` regenerates `lib/eve-surface.generated.ts` from the current Eve package export map and registry. `pnpm eve:surface:check` is intended for CI and fails when the generated surface is stale.

The human-readable coverage contract is [`docs/EVE_FEATURE_MATRIX.md`](./docs/EVE_FEATURE_MATRIX.md).
