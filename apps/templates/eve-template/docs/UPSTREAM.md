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

`scripts/test-upstream.mjs` (part of `pnpm test`) compares this app with the official `apps/templates/eve-chat-template` from `vercel/eve` main, which `pnpm upstream:sync` fetches into `node_modules/.cache/` (without it the check skips). Every upstream file the app changes or removes is listed in `docs/upstream-divergence.json` with a reason and a fingerprint of the upstream version it was reviewed against. The check fails when a new divergence has no reason, when a listed file matches upstream again (the list only shrinks), and when upstream changes a listed file, which is the cue to port that change. After reviewing, `node scripts/test-upstream.mjs --write` records new divergences as `TODO` and refreshes fingerprints; replace each `TODO` with a reason. Cosmetic-only differences are restored to upstream rather than listed.

`scripts/check-product.sh` fetches the baseline before `pnpm test`, so CI always compares against current upstream: an upstream change to a listed file fails the check until it is ported or recorded.

## Deliberate overrides

A few overrides exist because demonstrating composition is itself useful:

- `agent/tools/write_file.ts`: wraps the official eve `write_file` definition with `always()` approval.
- `agent/tools/agent.ts`: replaces the built-in model-facing root-copy tool with official `agentRouter()` while the root-copy target remains available to workflow routing.
- `agent/channels/eve.ts`: inherited from Chat Template, with attachments enabled to match the current Web Chat scaffold.

Each override should stay visibly based on an exported eve definition. Avoid reimplementing framework behavior.

## Versioning

The app pins an exact published `eve` version in `package.json`. `docs/upstream.generated.json` records where the app was first materialized from, inside the eve monorepo, before it moved to its own repository.

## Patched dependencies

`pnpm-workspace.yaml` lists one patch file, which pnpm applies on install (the Dockerfile copies `patches/` before `pnpm install`). `patches/eve@0.67.0.patch` makes three changes:

- **Memory tools survive attachments** (`dist/src/context/memory-tools.js`): eve's memory tools (`save_memory`, `remove_memory`) keep a durable copy of the turn context, including the conversation's messages. An attached image is not plain JSON, so from the first photo in a chat eve logged `Dynamic tool resolver (turn.started) failed` and left the memory tools out of every later turn of that chat, Telegram included. The patch stores the context without the messages and the turn's input, which the file memory tools never read. The bug is still in `packages/eve/src/context/memory-tools.ts` on eve main. Drop this change when eve stops putting messages in that closure. `scripts/check-product.sh` fails if any browser check makes eve log a failed dynamic tool resolver.
- **The bash sandbox cannot reach private addresses** (`dist/src/execution/sandbox/bindings/just-bash-runtime.js`): eve creates the just-bash sandbox with `network: { dangerouslyAllowFullInternetAccess: true }` and exposes no network policy for it, so the agent's `curl` reached eve's own API and workflow queue on 127.0.0.1, other containers and cloud metadata (169.254.169.254): a server-side request forgery path for injected instructions. The patch adds just-bash's `denyPrivateRanges: true`, which refuses loopback, private and link-local targets even with full internet access, including hosts that resolve to them and redirect hops. Public internet access is unchanged. Drop this change when eve sets it itself or lets the app pass a just-bash network policy. `scripts/test-sandbox-network.mjs` fails if the sandbox reaches a loopback server again.
- **A sandbox session whose files are gone starts again** (`dist/src/execution/sandbox/bindings/just-bash.js`, `resume()`): eve keeps each chat's just-bash files under `.eve/sandbox-cache/just-bash/sessions/<id>` beside the app, while the session's saved state (with that path) is in the workflow data on the volume. In a new container every sandbox call of an existing chat failed with `just-bash session root "…" no longer exists.` and eve never recovered (hundreds of retries in one turn). The image now links that directory to the volume (`sandbox-sessions/`, see the Dockerfile), and the patch makes `resume()` recreate a missing root from the prepared template, as `start()` does, with a warning, instead of throwing: this covers chats started before the link and restored volumes. The generation/root-path compatibility check is unchanged. Drop this change when eve recovers a missing session root itself. `scripts/test-sandbox-resume.mjs` covers the link and the recovery.

After an eve version bump, re-create the patch for the new version (`pnpm patch eve@<version>`) or remove it.

## Upgrade audit

After raising the `eve` version:

```bash
pnpm install
pnpm eve:surface   # review the diff in lib/eve-surface.generated.ts and public/reference
pnpm upstream:sync && pnpm check
pnpm check:full
```

Then review `node_modules/eve/CHANGELOG.md` for removed/deprecated authoring APIs and update the feature matrix if a public capability has changed classification.

## Orchestration additions

The operator layer reuses `defineDynamic` / system- and user-role instructions, the existing step-level model router, `defineWorkflowTool` + `ctx.agent`, `always()` approval, AI SDK `UserContent`, the eve React transport and the repository's shadcn/Radix Dialog, DropdownMenu, Select and Command primitives. No framework-core fork, duplicate streaming transport, second agent runtime or custom modal focus manager is introduced.

Version-sensitive sources are the installed `eve/docs` instructions, dynamic-capabilities, subagents, workflow tools, client messages and self-hosting guides; the official AI Elements Prompt Input / Attachments / Model Selector references; shadcn Command/Dialog; and Dokploy application/domain documentation. Existing vendored AI Elements retain their attribution. Only product-specific state, persistence and orchestration glue is authored here.
