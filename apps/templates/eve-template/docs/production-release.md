# September 2026 operator release

Host: ai-chat.se, Dokploy application YZiCsMtzVXR5vLrO8AgWM, Caceras/eve-template main.

Temporary login: Riki / 1010, configurable with EVE_CHAT_USERNAME and EVE_CHAT_PASSWORD. Session signatures require an independent EVE_SESSION_SECRET. This is a shared operator account, not a multi-user service. The local login limiter supports the current single replica; use shared rate-limit storage before scaling.

Model access comes from Vercel AI Gateway or OpenRouter, chosen in Settings with keys saved encrypted on the volume (AI_GATEWAY_API_KEY and OPENROUTER_API_KEY are fallbacks). See [SELF_HOSTING.md](./SELF_HOSTING.md). Set a spending limit on each provider key; each session also stops at $25 of model cost. Profile memory uses EVE_MEMORY_DIR on the existing persistent volume, separately from browser-local chat history. Browser history does not synchronize across devices. Sandbox work files are not guaranteed to persist across replacement.

Build: pnpm install --frozen-lockfile, pnpm build:eve, pnpm build. Start: node scripts/start-self-hosted.mjs. Node 24+ required, including node:sqlite. Proxy forwards the workflow callback prefix as well as the existing eve routes.

Validation: pnpm typecheck and node scripts/test-production.mjs; production builds for eve and Next.js. Verify the public health route, logged-out Agent page, username login, a real streamed model response, resumed history, and profile-memory recall after deployment.

Rollback: pre-release service spec and workflow archive are stored in /root/aegentica-backups/20260922-before-polish on the VPS, with image agents-eve-chat-87enki:pre-polish-20260922 retained. Roll back the image and prior service environment together; never replace the persistent volume with an empty one. Archive integrity was checked; a complete restore was not rehearsed.
