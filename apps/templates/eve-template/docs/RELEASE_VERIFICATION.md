# Release verification

Release identifier: `polish-2026-09-24b`. The health response distinguishes this product release from the previous UI. The final merged commit and Dokploy deployment record identify the exact deployed source.

## Required checks

The read-only product workflow installs the template's frozen lockfile on Node 24 and runs `bash scripts/check-product.sh`: the isolated regression scripts (`pnpm test`), eve compilation, Next.js type generation and checking, a Next.js production build, and Playwright Chromium acceptance. Explicit exit handling prevents successful log pipelines from concealing failed commands. CI has no production credentials or production data.

The existing root workflow checks framework lint, invariants, documentation and framework tests. A failure predating the release requires baseline evidence; it must not simply be dismissed. The main baseline `a82f3045ba8edeac3328913932465da8b65bbabb` already has a failing `test-tui` job in run `35804349097` (job `107001675492`). Product changes do not modify that framework TUI. New product failures remain release blockers.

Browser acceptance uses the actual production build with isolated storage, generated credentials and eve's deterministic mock model (`AEGENTICA_TEST_MODEL=mock`, from `eve/evals`), so a real chat turn streams a tool card and reply that must survive a reload. It covers UI password sign-in, logged-out private API denial, saved-agent creation/editing/selection, the model picker, Cmd/Ctrl+K navigation, utility routes, attachment persistence across provisional-to-canonical chat navigation and rejected sends, mobile focus trapping, viewport overflow, logout and password rotation. Old cookies must fail after a password change while saved profiles remain intact. Uncaught browser errors fail acceptance; screenshots and JSON results are artifacts.

## Runtime contracts

`app/(chat)/layout.tsx` resolves environment-dependent authentication, the viewer and history after `connection()` behind a Suspense boundary. The shell receives the same request-resolved initial values used for server rendering. Do not read Docker runtime credentials into a build-time shell placeholder: the image is built without those credentials and Dokploy supplies them later. The bootstrap synchronizer still reconciles navigation and history.

The product's `use-reliable-eve-agent` hook preserves the upstream `eve/react` store and callbacks. eve records failed sends in `onError` / the terminal snapshot rather than rejecting every `send()` promise. The wrapper surfaces those failures to the existing composer recovery path. Only successful sends clear attachments; rejected sends retain the files and text and release the busy state. Do not treat a resolved upstream send promise alone as inference success.

Saved agents are encrypted profiles of the operator workspace, not separate deployments or permission boundaries. Direct chat applies their instructions, reference context, reasoning and preferred model; an explicit composer selection wins over the profile default. Delegation uses the compiled researcher and the current conversation model. Runtime tools retain their own approvals. See [Agents and orchestration](./AGENTS_AND_ORCHESTRATION.md).

## Live release

1. Confirm `agents/eve-chat`, repository `Caceras/eve-template`, branch `main`, Docker context `apps/templates/eve-template`.
2. Preserve `eve-chat-data`, all existing environment values and the settings signing/encryption secret.
3. Deploy the tested merged revision through Dokploy. Wait for the build and healthy runtime; queued is not deployed.
4. Verify HTTPS, the health release identifier, new page routes, and 401 responses from private profile, image, history and settings APIs without authentication.
5. Verify the authenticated live UI when credentials are available. Distinguish isolated browser acceptance from production authentication.
6. Remove the temporary QA compose and its own volume after collecting evidence. Never remove the production data volume.

`aegentica.se` is the primary domain, registered at Loopia until 2027-09-24. Its apex and `www` A records point to the VPS (136.148.209.184), and both hosts are Dokploy domains of the same application with Let's Encrypt certificates (verified 2026-09-24). `ai-chat.se` remains an alias of that application. After a deploy, check `/api/health` on both hosts.

## External verification

A working AI Gateway or OpenRouter key is supplied by the operator later. Real model responses, model/provider switching during a durable conversation, tool-approval continuation, saved-profile delegation and generated images require inference checks after that. Physical microphone/speaker behavior needs a device check. External integrations require their own credentials. No placeholder images or fake success states stand in for those checks.

Replace the legacy password through Settings > Security before adding credentials. See [Security and access](./SECURITY_AND_ACCESS.md). Password changes revoke old sessions without changing the settings encryption secret or erasing data.
