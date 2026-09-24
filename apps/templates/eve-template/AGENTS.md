# Ægentica (eve agent app)

This project uses the eve framework. Before writing code, read the relevant guide in `node_modules/eve/docs/` (the docs shipped with the installed eve version; `README.md` there is the index).

Before any user-facing UI, UX, navigation, authentication, responsive-layout, or styling change, read `docs/DESIGN.md` first and treat it as a hard contract. Preserve and improve capabilities; never remove or hide functionality as a shortcut to match upstream styling.

For capability-facing UI, also read `docs/EVE_FEATURE_MATRIX.md` and preserve the distinction between **Active**, **Included**, and **Available**.

Prefer upstream over custom code (`docs/UPSTREAM.md`): keep eve defaults, mount registry items and extensions instead of copying them, and reuse the chat template's components and shadcn/ui primitives in `components/ui/`.

Keep the docs true in the same change: `README.md` for the feature list, `docs/WEB_APP.md`, `docs/GITHUB.md`, `docs/SELF_HOSTING.md` and `docs/TELEGRAM_AND_SCHEDULES.md` for behavior, `docs/EVE_FEATURE_MATRIX.md` for capability coverage and `docs/VISION.md` for roadmap status.

Use `eve` lowercase in user-facing copy, docs, prompts, and comments. Do not
title-case it unless it is part of an exact external title or quoted text.

For saved agents, attachments or navigation, read `docs/AGENTS_AND_ORCHESTRATION.md` and `docs/RELEASE_VERIFICATION.md`. Profile text is not a permission grant. Prefer eve workflows and client content types over parallel runtimes or transports. Test both logged-out APIs and the actual self-hosted operator flow.

## Build and verify

Cloud sessions run `.claude/hooks/session-start.sh` at the repository root: Node from `.nvmrc`, dependencies, and Playwright pointed at the preinstalled Chromium (`PLAYWRIGHT_MODULE`, `PLAYWRIGHT_CHROMIUM_EXECUTABLE`).

- `pnpm check` after every change: regression scripts (`scripts/test-*.mjs` via `node --test`) and typecheck. New `scripts/test-*.mjs` files join automatically; browser scripts end in `-browser.mjs`.
- `pnpm check:full` before a PR: the same release check CI runs (`scripts/check-product.sh`).
- `pnpm qa:tour` for any UI change: start `scripts/start-self-hosted.mjs` with test credentials and `AEGENTICA_TEST_MODEL=mock`, then review the screenshots it writes.
