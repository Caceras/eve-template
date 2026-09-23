# Release verification

Release identifier: `orchestration-2026-09-23`. The public health response includes this identifier so a deployed UI can be distinguished from an older successful build. Source of truth is the final merged commit and Dokploy deployment record, not this document's date.

## Required checks

The product workflow must install the template's frozen lockfile on Node 24, run the isolated template regression scripts, generate Next.js types, build eve and build Next.js. The existing root workflow remains responsible for framework lint, invariants and framework tests. A failure predating this release must be demonstrated against the baseline, not dismissed without evidence.

Browser checks use a locally started production build with isolated storage and test-only credentials. They should cover password sign-in, logged-out private API denial, Agents CRUD and selection, Cmd/Ctrl+K, all utility pages, attachments persisted across provisional-to-canonical chat navigation, mobile sidebar focus and viewport overflow. Store screenshots and test results as CI artifacts. Do not include real secrets or production user data in artifacts.

## Live release

1. Confirm the app is `agents/eve-chat`, source `Caceras/eve-template`, production branch `main`, Docker context `apps/templates/eve-template`.
2. Preserve `eve-chat-data`, all environment secrets and the existing signing secret. Deploy through Dokploy only after checking the final commit.
3. Wait for build completion and container health. A queued deployment is not a live release.
4. Verify `/api/health` has the expected release identifier, HTTPS works, the new routes load, and logged-out profile, image and settings APIs return 401.
5. Verify the authenticated UI on the live deployment when credentials are available. Do not call mocked inference or headless browser speech tests a real model, image, microphone or speaker test.
6. Remove the temporary isolated release-QA compose and its own volume. Never remove the production data volume.

`aegentica.se` is the requested primary domain. DNS registration/delegation, A/AAAA routing, the Dokploy domain rule and TLS must all be verified independently. Until then, preserve the existing `ai-chat.se` route. Do not claim domain readiness from a screenshot of a purchase or a configured reverse-proxy rule.

## Remaining credential-dependent verification

The operator supplies a working AI Gateway or OpenRouter key later. Real model responses, provider/model switching during a durable conversation, tool approval continuation, saved-profile delegation, image generation and physical-device dictation/read-aloud require their own checks. External integrations require their respective credentials. No fake success states or placeholder generated images are permitted.
