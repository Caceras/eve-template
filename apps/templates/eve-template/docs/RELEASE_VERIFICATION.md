# Release verification

Release identifier: `orchestration-2026-09-23`. The public health response includes this identifier so a deployed UI can be distinguished from an older successful build. Source of truth is the final merged commit and Dokploy deployment record, not this document's date.

## Required checks

The read-only product workflow installs the template's frozen lockfile on Node 24 and runs `bash scripts/check-product.sh`. This runs thirteen isolated regression scripts, builds eve, generates and checks Next.js types, builds Next.js, and tests the production UI with Playwright Chromium. Explicit process exit handling prevents a log pipeline from concealing a failure. CI has no production secrets or production data access.

The existing root workflow remains responsible for framework lint, invariants and framework tests. A failure predating this release must be demonstrated against the baseline, not dismissed without evidence. Inspect actual logs and assertions, not just individual step conclusions: continue-on-error can display a successful conclusion for a failed step. The initial QA run exposed profile typing issues; a follow-up exposed a missing closing brace. Neither is passing release evidence.

Browser checks use a locally started production build with isolated storage and test-only credentials. Coverage includes password sign-in, logged-out private API denial, Agents CRUD and selection, Cmd/Ctrl+K, utility pages, attachment persistence across provisional-to-canonical chat navigation, mobile sidebar focus and viewport overflow. Screenshots and results are CI artifacts. Real secrets and production data must never appear in these artifacts.

## Live release

1. Confirm the app is `agents/eve-chat`, source `Caceras/eve-template`, production branch `main`, Docker context `apps/templates/eve-template`.
2. Preserve `eve-chat-data`, all environment secrets and the existing signing secret. Deploy through Dokploy only after checking the final commit.
3. Wait for build completion and container health. A queued deployment is not a live release.
4. Verify `/api/health` has the expected release identifier, HTTPS works, new routes load, and logged-out profile, image and settings APIs return 401.
5. Verify the authenticated UI on the live deployment when credentials are available. Do not call mocked inference or headless browser speech tests a real model, image, microphone or speaker test.
6. Remove the temporary isolated release-QA compose and its own volume. Never remove the production data volume.

`aegentica.se` is the requested primary domain. DNS registration/delegation, routing, the Dokploy domain rule and TLS must be verified independently. Preserve the existing `ai-chat.se` route until then. At review time the domain was absent from the registry DNS; the registrar invoice explicitly requires payment before registration. Do not duplicate the order or claim activation from an invoice alone.

## Credential-dependent verification

The operator supplies a working AI Gateway or OpenRouter key later. Real model responses, provider/model switching during a durable conversation, tool approval continuation, saved-profile delegation, image generation and physical-device dictation/read-aloud require their own checks. External integrations require their respective credentials. No fake success states or placeholder generated images are permitted.

Before adding credentials, replace the legacy password through Settings > Security. See [Security and access](./SECURITY_AND_ACCESS.md). Changing the password must not change the settings encryption secret or erase stored data.
