# Agents and orchestration

The Agents page is the no-code entry point to this **single-operator, self-hosted** workspace. A saved agent is a reusable profile, not a second runtime, security principal, tenant or deployed process. All execution remains in eve.

## Create and use an agent

Open `/agents`, choose Create, and supply a name, instructions and optional reference context. A preferred model and reasoning effort can be selected. Research, editing and project starter instructions are editable starting points, not external packages. Save, then choose Chat or select the profile in the main composer. Editing uses optimistic version checks: a stale tab must reload rather than overwrite newer work. Duplicate creates an independent profile. Deleting requires confirmation.

Profiles do not install tools, create credentials, widen permissions or change compiled capabilities. The composer can override the preferred model for a turn. Unsupported models resolve under the existing provider selection policy; the picker shows the effective choice. A provider change applies to the next model **step**, not necessarily the next complete conversation turn.

## Delegation

The root agent has three new tools:

- `list_saved_agents`: returns profile identifiers, names and descriptions, not their private reference context.
- `create_saved_agent`: creates a profile after eve's `always()` approval. Only the authenticated operator may execute it.
- `delegate_to_agent`: looks up the profile in a durable workflow step and sends the snapshot plus task to the existing compiled `researcher` child with `ctx.agent()`. This is a background eve workflow; completion returns through eve's existing task mechanism.

A delegated profile uses the **current conversation model and the compiled researcher's existing tools**, not a separately provisioned agent or the profile's preferred model. The ordinary Agent Chat selection uses the preferred model. The reviewer remains the existing independent specialist. Existing approval, cancellation, durable session and budget semantics are retained; the application does not create a second job queue.

## Runtime boundaries

The password-auth adapter resolves `x-aegentica-profile` only after verifying the operator cookie. It stores a validated instruction snapshot in eve's authenticated turn attributes. Dynamic instructions use `turn.started` and user-role context. Profile reasoning is applied through the existing dynamic model configuration. Missing or deleted profiles produce a recovery message rather than silently running another agent. An arbitrary HTTP profile identifier alone is not authorization.

Reference context is encrypted at rest and becomes model input when the profile is used. Do not put secrets in instructions or reference context. A profile is not a retrieval-augmented knowledge base: text is included directly, subject to field limits. Independent tool allowlists, per-agent identities, uploaded avatars, arbitrary code/skill installation and tenant isolation are not supplied by this profile editor.

## Storage and limits

`settings/agents.enc.json` lives on the existing persistent volume. It uses the existing AES-256-GCM settings store keyed from `EVE_SESSION_SECRET`; preserve that secret across deployments and backups. Read-modify-write is serialized across the Next.js and eve processes with the existing settings lock. The operator workspace holds at most 64 profiles. Names are 64 characters, descriptions 240, instructions 4,000 and reference context 4,000. The authenticated profile request is capped at 64 KiB; other settings retain their existing 16 KiB cap. Profile writes use the existing 30/minute settings rate limit.

## Discover and operate

`/capabilities` separates **Runtime** (live declarations), **Included** (repository patterns) and **Directory** (official registry snapshot). Search and category filters cover the complete inventory; a declaration is not proof of working credentials. Capability details show the access declaration when available and the maintainer setup command for registry items. Installation remains code-first: review, configure, build, test and deploy via Dokploy.

Global Search and Cmd/Ctrl+K navigate pages, settings, creation actions and up to 100 recent conversations available to the signed-in caller. `/session` retains the upstream durable-session controls, and `/tasks` retains scheduled work. No API key is required to create profiles, browse the directory or manage settings; model execution still requires a valid funded provider credential.

## Validation

Run `node scripts/test-agent-profiles.mjs`, the existing provider/model tests, `pnpm typecheck`, `pnpm build:eve` and `pnpm build`. Browser validation should create, edit, duplicate, select and delete a profile; verify optimistic conflicts and logged-out API denial; open and close mobile navigation and command search; and test an actual delegated model turn once credentials are supplied. Deterministic tests are not evidence of successful live inference.
