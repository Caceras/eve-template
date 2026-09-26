# Ægentica (eve agent app)

This project uses the eve framework. Before writing code, read the relevant guide in `node_modules/eve/docs/` (the docs shipped with the installed eve version; `README.md` there is the index).

Before any user-facing UI, UX, navigation, authentication, responsive-layout, or styling change, read `docs/DESIGN.md` first and treat it as a hard contract. Preserve and improve capabilities; never remove or hide functionality as a shortcut to match upstream styling.

For capability-facing UI, also read `docs/EVE_FEATURE_MATRIX.md` and preserve the distinction between **Active**, **Included**, and **Available**.

Prefer upstream over custom code (`docs/UPSTREAM.md`; `scripts/test-upstream.mjs` lists and pins every divergence from the official chat template): keep eve defaults, mount registry items and extensions instead of copying them, and reuse the chat template's components and shadcn/ui primitives in `components/ui/`.

Keep the docs true in the same change: `README.md` for the feature list, `docs/WEB_APP.md`, `docs/GITHUB.md`, `docs/SELF_HOSTING.md` and `docs/TELEGRAM_AND_SCHEDULES.md` for behavior, `docs/EVE_FEATURE_MATRIX.md` for capability coverage and `docs/VISION.md` for roadmap status.

Use `eve` lowercase in user-facing copy, docs, prompts, and comments. Do not
title-case it unless it is part of an exact external title or quoted text.

For saved agents, attachments or navigation, read `docs/AGENTS_AND_ORCHESTRATION.md` and `docs/RELEASE_VERIFICATION.md`. Profile text is not a permission grant. Prefer eve workflows and client content types over parallel runtimes or transports. Test both logged-out APIs and the actual self-hosted operator flow.

## Build and verify

Cloud sessions run `.claude/hooks/session-start.sh` at the repository root: Node from `.nvmrc`, dependencies, and Playwright pointed at the preinstalled Chromium (`PLAYWRIGHT_MODULE`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`).

- Docs have one home per fact: `README.md` features and pages, `docs/DESIGN.md` UI rules, `docs/production-release.md` operations, deploy and release history, `docs/RELEASE_VERIFICATION.md` checks and domains. `scripts/test-docs.mjs` (part of `pnpm test`) fails on broken doc links, missing scripts or commands, and routes missing from README. A release bumps `RELEASE` in `lib/release.ts` (`/api/health` reports it, and an open app compares it with the release it was built with) and adds one Release history line.
- `pnpm check` after every change: regression scripts (`scripts/test-*.mjs` via `node --test`), lint, format check and typecheck. New `scripts/test-*.mjs` files join automatically; browser scripts end in `-browser.mjs`.
- `pnpm check:full` before a PR: the same release check CI runs (`scripts/check-product.sh`).
- `/ship` (`.claude/skills/ship/SKILL.md` at the repository root) runs the whole release: checks, tour, PR, CI, merge, deploy and `pnpm verify:live` against both domains. Merge and deploy only with the operator's approval.
- `pnpm qa:tour` for any UI change: start `scripts/start-self-hosted.mjs` with test credentials and `AEGENTICA_TEST_MODEL=mock`, then review the screenshots it writes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
