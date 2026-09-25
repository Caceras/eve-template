# Upstream policy

`eve-template` is intentionally a thin reference layer on top of the official eve repository. It should never become a parallel agent framework.

## Canonical source precedence

When two official examples differ, use the newest compatible behavior in this order:

1. `packages/eve/package.json` exports and `packages/eve/src/public/**`
2. `docs/**`
3. `apps/docs/registry/**` and `apps/docs/registry.json`
4. `e2e/fixtures/**`
5. `apps/frameworks/**`
6. `apps/templates/**`
7. Vercel Labs showcase templates linked by eve.dev

The lower entries are valuable examples, but several showcase templates intentionally lag the current eve package version. Never downgrade the framework API merely to preserve old sample syntax.

## Reuse rule

For every capability:

1. If eve supplies a framework default, leave the default in place and surface it through agent-info/UI.
2. If eve supplies a registry item, use or expose the registry item rather than copying its internal implementation.
3. If eve supplies current scaffold code (for example `channel/web`), copy that scaffold during materialization rather than maintaining a forked rewrite.
4. If eve supplies a current e2e fixture for an API with no scaffold, adapt the smallest possible example.
5. Write custom code only for reference glue or UI that eve does not supply.

## Divergence check

`scripts/test-upstream.mjs` (part of `pnpm test`) compares this app with `apps/templates/eve-chat-template`. Every upstream file the app changes or removes is listed in `docs/upstream-divergence.json` with a reason and a fingerprint of the upstream version it was reviewed against. The check fails when a new divergence has no reason, when a listed file matches upstream again (the list only shrinks), and when upstream changes a listed file, which is the cue to port that change. After reviewing, `node scripts/test-upstream.mjs --write` records new divergences as `TODO` and refreshes fingerprints; replace each `TODO` with a reason. Cosmetic-only differences are restored to upstream rather than listed.

The baseline itself is kept live: `pnpm upstream:check` (part of `scripts/check-product.sh`) fetches `apps/templates/eve-chat-template` from `vercel/eve` main and fails when the local copy is behind. `pnpm upstream:sync` refreshes it; then run `pnpm test` and port or record each upstream change.

## Deliberate overrides

A few overrides exist because demonstrating composition is itself useful:

- `agent/tools/write_file.ts`: wraps the official eve `write_file` definition with `always()` approval.
- `agent/tools/agent.ts`: replaces the built-in model-facing root-copy tool with official `agentRouter()` while the root-copy target remains available to workflow routing.
- `agent/channels/eve.ts`: inherited from Chat Template, with attachments enabled to match the current Web Chat scaffold.

Each override should stay visibly based on an exported eve definition. Avoid reimplementing framework behavior.

## Versioning

During development inside the eve monorepo, the materializer sets the generated template's `eve` dependency to the exact version in `packages/eve/package.json`. The same checkout therefore defines both framework semantics and the template being demonstrated.

The generated `docs/upstream.generated.json` records the eve version and Git commit used for materialization.

## Upgrade audit

After updating upstream eve:

```bash
node scripts/materialize-eve-template.mjs .
cd apps/templates/eve-template
pnpm install
pnpm eve:surface:check
pnpm typecheck
pnpm build:eve
pnpm build
pnpm eval
```

Then review `packages/eve/CHANGELOG.md` for removed/deprecated authoring APIs and update the feature matrix if a public capability has changed classification.

## Orchestration additions

The operator layer reuses `defineDynamic` / user-role instructions, the existing step-level model router, `defineWorkflowTool` + `ctx.agent`, `always()` approval, AI SDK `UserContent`, the eve React transport and the repository's shadcn/Radix Dialog, DropdownMenu, Select and Command primitives. No framework-core fork, duplicate streaming transport, second agent runtime or custom modal focus manager is introduced.

Version-sensitive sources are the installed `eve/docs` instructions, dynamic-capabilities, subagents, workflow tools, client messages and self-hosting guides; the official AI Elements Prompt Input / Attachments / Model Selector references; shadcn Command/Dialog; and Dokploy application/domain documentation. Existing vendored AI Elements retain their attribution. Only product-specific state, persistence and orchestration glue is authored here.
