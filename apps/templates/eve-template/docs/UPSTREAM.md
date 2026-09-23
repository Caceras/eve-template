# Upstream policy

`eve-template` is intentionally a thin reference layer on top of the official Eve repository. It should never become a parallel agent framework.

## Canonical source precedence

When two official examples differ, use the newest compatible behavior in this order:

1. `packages/eve/package.json` exports and `packages/eve/src/public/**`
2. `docs/**`
3. `apps/docs/registry/**` and `apps/docs/registry.json`
4. `e2e/fixtures/**`
5. `apps/frameworks/**`
6. `apps/templates/**`
7. Vercel Labs showcase templates linked by eve.dev

The lower entries are valuable examples, but several showcase templates intentionally lag the current Eve package version. Never downgrade the framework API merely to preserve old sample syntax.

## Reuse rule

For every capability:

1. If Eve supplies a framework default, leave the default in place and surface it through agent-info/UI.
2. If Eve supplies a registry item, use or expose the registry item rather than copying its internal implementation.
3. If Eve supplies current scaffold code (for example `channel/web`), copy that scaffold during materialization rather than maintaining a forked rewrite.
4. If Eve supplies a current e2e fixture for an API with no scaffold, adapt the smallest possible example.
5. Write custom code only for reference glue or UI that Eve does not supply.

## Deliberate overrides

A few overrides exist because demonstrating composition is itself useful:

- `agent/tools/write_file.ts`: wraps the official Eve `write_file` definition with `always()` approval.
- `agent/tools/agent.ts`: replaces the built-in model-facing root-copy tool with official `agentRouter()` while the root-copy target remains available to workflow routing.
- `agent/channels/eve.ts`: inherited from Chat Template, with attachments enabled to match the current Web Chat scaffold.

Each override should stay visibly based on an exported Eve definition. Avoid reimplementing framework behavior.

## Versioning

During development inside the Eve monorepo, the materializer sets the generated template's `eve` dependency to the exact version in `packages/eve/package.json`. The same checkout therefore defines both framework semantics and the template being demonstrated.

The generated `docs/upstream.generated.json` records the Eve version and Git commit used for materialization.

## Upgrade audit

After updating upstream Eve:

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
