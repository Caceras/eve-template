# Production release (aegentica.se)

Hosts: aegentica.se (primary), www.aegentica.se and ai-chat.se, one Dokploy application `YZiCsMtzVXR5vLrO8AgWM`, built from
`Caceras/eve-template` `main` (auto-deploy is off; deploy from Dokploy after a
merge). One container runs Next.js on port 3000 and the eve runtime on
127.0.0.1:4274 under `scripts/start-self-hosted.mjs`. The persistent volume
`eve-chat-data` is mounted at `/app/.eve/.workflow-data`.

## What lives on the volume

- `chats.sqlite`: chat history (`EVE_CHAT_DB_PATH` overrides)
- `profile.sqlite` inside `EVE_MEMORY_DIR`: long-term memory
- `settings/*.enc`: provider keys, GitHub and Telegram tokens, push keys and
  devices, scheduled tasks and saved agents (`settings/agents.enc.json`),
  encrypted with a key derived from `EVE_SESSION_SECRET`
- generated images and their metadata
- eve's workflow data for durable sessions

Never replace the volume with an empty one, and keep `EVE_SESSION_SECRET`
with it: a new secret makes the saved settings unreadable.

## Access

Operator login is set with `EVE_CHAT_USERNAME` and `EVE_CHAT_PASSWORD`; change
the initial password. It is a single operator account, not a multi-user
service. The login limiter is per process, which suits the single replica.

## Model access

Choose Vercel AI Gateway or OpenRouter in Settings; keys are saved encrypted
on the volume (`AI_GATEWAY_API_KEY` and `OPENROUTER_API_KEY` are fallbacks).
Set a spending limit on each key; each session also stops at $25 of model
cost. Keep a second provider's key saved: if one provider rejects its key,
switching is one click. See [SELF_HOSTING.md](./SELF_HOSTING.md).

## Deploy and verify

Build: `pnpm install --frozen-lockfile`, `pnpm build:eve`, `pnpm build`
(Node 24); the image then drops `.next/cache` and dev-only packages. Release only a merged revision whose product check passed:

1. Confirm Dokploy `agents/eve-chat`: repository `Caceras/eve-template`, branch
   `main`, Docker context `apps/templates/eve-template`. Keep `eve-chat-data`
   and every environment value, including `EVE_SESSION_SECRET`.
2. Deploy from Dokploy and wait for a finished build and a healthy runtime;
   queued is not deployed.
3. `/api/health` on aegentica.se and ai-chat.se reports `app`, `eve` and `storage` ready and a `release`
   matching `RELEASE` in `app/api/health/route.ts`.
4. Logged out, `/api/chats`, `/api/agents`, `/api/images` and
   `/api/settings/*` return 401.
5. `/sw.js`, `/manifest.webmanifest` and `/icons/icon-192.png` load.
   `pnpm verify:live` checks steps 3 to 5 on both domains.
6. Signed in: the active provider's **Test connection** succeeds, a chat
   streams a reply and reappears in the sidebar after a reload, and the Memory
   and Tasks pages load.
7. Read the runtime logs. Remove any temporary QA container and its own volume;
   never the production volume.

## Rollback

Redeploy the previous commit from Dokploy. Code changes never migrate data
destructively: the SQLite files add tables and columns only. A backup of the
pre-polish image and workflow archive from 22 September 2026 is kept on the
VPS under `/root/aegentica-backups/20260922-before-polish`.

## Release history

- `orchestration-2026-09-23`: saved agent profiles, eve-native delegation, main-chat attachments, private image library, global search, capability directory.
- `polish-2026-09-24`: eve 0.66.2, file sharing from the Android share sheet, app icon badges, keyboard-aware layout, conversation picker on Activity.
- `polish-2026-09-24b`: errors keep the phone top bar usable and link to Settings, one search control per layout, readable capability rows, compact Activity toolbar.
- `maintenance-2026-09-24`: eve 0.66.3 and better-auth 1.7.5 patch releases.
- `maintenance-2026-09-25`: no false Better Auth schema error in password mode, about 310 MB smaller image, chat saves per turn no longer grow with reply length.

Entries describe code scope. [RELEASE_VERIFICATION](./RELEASE_VERIFICATION.md) holds the checks and domain gates.
