---
name: ship
description: Ship an Ægentica product change end to end - checks, visual tour, PR, CI, merge and live deploy with verification. Use when asked to ship, release, merge and deploy, or "take it live" for apps/templates/eve-template.
---

# Ship an Ægentica change

Work in `apps/templates/eve-template`. Read its `AGENTS.md` first. Stop and report at any failed step; never skip a check to get through.

1. **Fast check.** `pnpm check` (regression scripts, docs, upstream divergence, typecheck). Fix every failure.
2. **Look at it.** For any UI change, start `scripts/start-self-hosted.mjs` with test credentials and `AEGENTICA_TEST_MODEL=mock`, run `pnpm qa:tour`, and review the phone and desktop screenshots in light and dark.
3. **Release bookkeeping.** For a user-facing change, bump `RELEASE` in `app/api/health/route.ts` and add one line to Release history in `docs/production-release.md`. Keep behavior docs true in the same change.
4. **Full check.** `pnpm check:full` must pass: builds and browser acceptance, including a real chat turn.
5. **PR.** Commit with `git commit -s`, push the session branch, and open a PR following `.github/pull_request_template.md`. Subscribe to its activity.
6. **CI.** Wait for every workflow on the head commit. On red, find the root cause, reproduce it locally, fix and push. A red check is never a flake by default.
7. **Merge.** Merge only when CI is green and the user has approved merging this PR.
8. **Deploy.** Deploy only with the user's approval: trigger Dokploy application `YZiCsMtzVXR5vLrO8AgWM` and wait until its deployment status is `done`. Queued or running is not deployed.
9. **Verify live.** `pnpm verify:live` checks both domains: healthy runtime with the expected `RELEASE`, private APIs return 401, app files load. Then read the Dokploy runtime logs.
10. **Report** the live URL, what changed, what was verified and anything not verified (for example real model replies, which need a provider key).
