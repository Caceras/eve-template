---
issue: https://github.com/vercel/eve/issues/742
status: proposed
last_updated: "2026-09-17"
---

# Package self-modification as an extension

## Decision

Make `eve/self-modification` contribute a packaged subagent. New installations
use one mount file; the implementation stays inside the published `eve` package.
Retire the old scaffolded subagent without failing application startup: its agent
helper resolves to unavailable, and its sandbox helper becomes inert. Keep import
and type compatibility stubs, not a second functional implementation or a frozen
copy of the old tools.

This is proposed behavior, enabled by extension subagent support introduced in
[d23467d](https://github.com/vercel/eve/commit/d23467dd4a5539400743054e49862ecb1864cf4a).

## Consumer API and filesystem

`eve add eve/self-modification` will add only
`agent/extensions/self-modification/extension.ts` to the existing agent:

```text
agent/
  agent.ts
  extensions/
    self-modification/
      extension.ts
```

```ts
// agent/extensions/self-modification/extension.ts
import selfModification from "eve/self-modification";

export default selfModification({
  // Uncomment to override the inherited model or set reasoning effort.
  // model: "provider/model",
  // reasoning: "high",
});
```

The scaffold contains only commented model/reasoning overrides. Do not emit
`local` or `deployed` configuration; an empty object uses the defaults.
Configuration lives inline in the mount, with no separate `config.ts`. Production
setup can write imports, credential-provider code, and `deployed` policy into this
same file. Preserve the generated-source digest and refusal to overwrite
developer-authored configuration; recognize the new default scaffold as eligible
for setup.

### Extension configuration

The proposed extension input has this shape, reusing existing eve types:

```ts
import type { AgentReasoningDefinition, AgentStaticModelDefinition } from "eve";
import type { SelfModificationConfig } from "eve/self-modification/config";

interface SelfModificationExtensionConfig {
  readonly model?: AgentStaticModelDefinition;
  readonly reasoning?: AgentReasoningDefinition;
  readonly local?: SelfModificationConfig["local"];
  readonly deployed?: SelfModificationConfig["deployed"];
}
```

Add `model` and `reasoning` to the extension's runtime validation schema,
preserving supported model objects. Forward model and reasoning to the packaged
child's internal agent helper, and policy to the agent, sandbox, and tools. The legacy
`SelfModificationConfig` type and `defineSelfModificationConfig` helper remain
policy-only; they do not need agent options.

Keep the existing `local` and `deployed` policy shape, including credential
providers and authorization callbacks. When omitted, model uses the effective
parent model and then the framework fallback; reasoning remains unspecified.
Local editing is enabled during `eve dev`, and deployed self-modification stays
unavailable without explicit configuration and authorization.

Backend selection remains internal, with no extension config override. Local
editing uses `just-bash` with the source filesystem. Deployed mode selects Vercel
Sandbox on Vercel, otherwise microsandbox where supported; an unsupported
environment produces the existing actionable error.

### Mounted contributions

Mounting as `self-modification` exposes the packaged `agent` subagent as
`self-modification__agent` to the parent. The child owns its sandbox, instructions,
and tools. Its directly authored tool names are
`edit_file`, `search_registry`, `registry_add`, `search_models`, and `publish`;
the outer mount namespace does not prefix tools inside the child.

Other mount namespaces and the existing single-file extension mount form remain
valid framework features. The registry and setup flow use the directory form
above. Do not introduce a second extension entrypoint or infer extension behavior
from its mounting location.

## Package boundaries

Restructure `packages/eve/src/self-modification/extension/`:

```text
extension/
  extension.ts
  subagents/
    agent/
      agent.ts
      sandbox.ts
      instructions.ts
      tools/
        edit_file.ts
        search_registry.ts
        registry_add.ts
        search_models.ts
        publish.ts
```

Only the child receives editing instructions and capabilities. No tools,
instructions, or sandbox belong at the extension root. Child modules read the
same bound extension configuration. Move active agent/sandbox construction to
internal helpers; the packaged child must not import the retired public helpers.
Keep shared runtime code in `eve`, not generated consumer files.

Verify configuration binding before calling helpers that currently resolve policy
at module evaluation. Discovery and compilation must not acquire credentials,
provision sandboxes, or accidentally capture empty/default policy before the
consumer mount binds configuration.

## Retire the old scaffold

Existing consumers have this structure:

```text
agent/subagents/self-modification/
  agent.ts
  config.ts
  sandbox.ts
  extensions/selfmod.ts
```

Retain the following public entrypoints:

| Entrypoint                      | Behavior after retirement                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eve/self-modification/agent`   | Preserve named/default exports and option types; resolve to `null` on both `session.started` and `turn.started`, regardless of options.          |
| `eve/self-modification/sandbox` | Preserve named/default exports and option types; return a valid inert sandbox definition without source mounts, credentials, or workspace setup. |
| `eve/self-modification/config`  | Keep existing policy objects and imports loadable.                                                                                               |
| `eve/self-modification`         | Mount the new packaged subagent and continue accepting the old policy shape.                                                                     |

The old `extensions/selfmod.ts` therefore discovers the new child beneath an
unavailable legacy parent. This is an intentional consequence of reusing the
canonical import, not another supported installation format. Discovery still
compiles that subtree; returning `null` does not prune it at build time.

For the standard scaffold, upgrade acceptance requires successful build/startup
and no usable legacy self-modification capability. Verify resumed child sessions
and explicit delegation, not only omission from the parent's capability list. If
persisted configuration bypasses the retired resolver, close that path before
release; do not assume ancestor unavailability alone provides the boundary.

A developer who replaced the helper with a custom agent definition is outside the
automatic retirement guarantee. Arbitrary authored modules still evaluate and can
fail independently. Retain package compatibility forwarders where they exist,
but do not promise support for every historical or customized scaffold.

## Warnings and migration setup

### Development warning

Start with a warning emitted by the retired agent resolver during development
(`EVE_DEV === "1"`), deduplicated once per development runtime instance across
both lifecycle events. This avoids adding a self-modification-specific protocol
to the compiler merely to report retirement. Module import alone must not warn.
Recreated dev workers may report again; ordinary turns must not repeat it.

Proposed message:

```text
[self-modification/retired-scaffold] The scaffolded self-modification subagent is disabled. Migrate to the new self-modification extension by running `/add eve/self-modification`.
```

`/add` is the development TUI command; terminal users can run
`eve add eve/self-modification`. No migration documentation URL is required for
this warning. Do not print configuration, credentials, or principal information.
Production runtime and model-facing conversations receive no retirement log.
Mark legacy helpers `@deprecated` for editor feedback.

A structured compiler warning is an alternative if the existing diagnostic path
can identify the retired helper without broad compiler changes. It would include
the authored source path and warn even before a development conversation starts.
Do not ship both surfaces with duplicate messages. Never detect retirement solely
from a directory name, or classify every dynamic `null` result as retirement.

### `eve add` migration steps

Before dependency changes or file writes, detect the legacy scaffold by its use
of the retired helper, not its directory name alone. Use bounded source inspection
without importing or executing consumer configuration.

Use one overwrite confirmation in the existing setup flow for `/add` and terminal
`eve add`:

1. Compare the scaffold with known defaults. Treat non-default settings, extra
   files, and source that cannot be confidently recognized as default as customized.
   If customized, warn: "Your self-modification scaffold contains customizations.
   These will not be transferred. You will need to customize the new extension
   again." Do not print configuration values or secrets.
2. Show the legacy paths to remove and the new mount path, then ask for approval
   to replace them with the default extension. Default to keeping existing files.
3. After approval, remove the reviewed legacy scaffold and write the default
   `agent/extensions/self-modification/extension.ts`. Transfer no settings,
   including model or reasoning. Extend the install transaction to restore removed
   files and any pre-existing destination if replacement fails.

Cancellation leaves files and dependencies unchanged. Generic `--yes` or
`--overwrite` flags must not bypass migration approval. Headless callers receive
an input-required setup outcome rather than an interactive prompt. Apply the same
gate to equivalent item addresses, the experimental alias, and setup-resume paths;
skipping setup must not leave a second mount alongside the old scaffold. Recheck
files before replacement and make resume safe after a completed migration.

Migration installs local defaults without launching production setup. Deployed
self-modification remains unavailable until separately configured. Fresh installs
retain their normal setup flow.

## Implementation sequence

1. **Package the child and add retirement stubs.** Move contributions under the
   child, bind configuration, and keep old exports loadable. Validate inactive
   nested mounts and resumed sessions before treating retirement as complete.
2. **Update registry installation and setup.** Change both registry entries to
   the single mount, add the migration approval and replacement steps, move the
   setup target, and generate inline configuration. Warn about non-default legacy
   customizations and replace with defaults; transfer no settings. Keep migration
   separate from production setup. Raise the registry's minimum eve requirement
   to the release containing this change. Keep
   required dependencies and fresh-install production credentials behavior intact.
3. **Update source guidance and security checks.** Stop deriving an editable
   child directory from the invocation name. Explain that implementation is
   package-owned and consumer settings live in the mount. Protect the new mount,
   policy, and override locations during deployed proposal publication, including
   supported alternate mount forms/namespaces. Retain old protected paths during
   the compatibility window. Handle transitive consumer policy imports without
   creating a new path around publication protection.
4. **Update tool-name consumers and warnings.** Adjust prompts and registry-tool
   descriptions, plus the TUI's `selfmod__registry_add` handoff recognition, for
   the child's `registry_add` name. Keep recognition tied to self-modification
   rather than accepting arbitrary similarly named tool results. Add the dev
   retirement warning or the compiler alternative, not both.
5. **Document and release.** Update extension/integration documentation with the
   new install and migration instructions. Add a minor changeset: disabling the
   old capability and changing the canonical extension's meaning are behavioral
   breaking changes despite preserved startup compatibility. No removal date for
   import stubs is promised; they contain no legacy execution behavior.

Parent-visible child names and source/node identities change on migration. Update
explicit delegation references, eval assertions, and event consumers; do not
promise continuity of old persistent child sessions. Source editing, draft-only
publication, authorization, and credential isolation retain their existing
semantics.

## Validation

- **Unit:** configuration accepts old policy and new options; retired resolvers
  always return `null` without authorization or credential calls; warnings are
  dev-only and deduplicated; the default scaffold contains only commented
  model/reasoning overrides and setup recognizes it without overwriting authored
  configuration; customization detection distinguishes known defaults from changed
  settings, extra files, and unrecognized source without evaluating code;
  installation detection and publication path protections cover their boundaries.
- **Integration/scenario:** fresh and packed-package mounts inherit the parent
  model, honor configured settings, and expose editing tools only in the child.
  The standard legacy scaffold builds and boots with the new extension nested
  beneath it but cannot delegate or resume usable legacy self-modification.
  Test automatic backend selection in local and deployed modes, unsupported
  environments, missing credentials, and denied authorization.
- **CLI/TUI:** customized scaffolds warn before overwrite approval. Approved
  migration removes only reviewed legacy files and writes the default mount with
  no settings transferred, including model/reasoning or deployed settings. Decline,
  cancellation, and missing approval leave files/dependencies unchanged; failure
  rolls back replacement. Cover existing destinations, custom files, concurrent
  edits, headless continuation, overwrite/skip-setup options, and idempotent resume.
  Fresh installs create only the mount. Registry setup handoffs still open the
  correct panel, and migration does not launch production credential setup.
- **E2E:** migrate `e2e/fixtures/agent-self-modification` preparation, cleanup, and
  name-based assertions to the registry's new target. Preserve real source-change
  coverage and add retirement coverage where fixture execution can express it.
  Update routing-only `agent-subagents` cases so they no longer depend on the
  retired helper. Run fixture evals in CI, not locally.

Run formatting, lint, typecheck, invariant checks, and relevant tier-configured
tests during implementation; run `pnpm docs:check` with published documentation
changes. Use the packed-package scenario to catch export/distribution regressions.
This plan itself changes no runtime behavior.
