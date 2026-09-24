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
  devices, scheduled tasks (encrypted with a key derived from `EVE_SESSION_SECRET`)
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

## Build and verify

Build: `pnpm install --frozen-lockfile`, `pnpm build:eve`, `pnpm build`
(Node 24). After a deploy, check:

1. `/api/health` reports `app`, `eve` and `storage` ready.
2. Logged out, `/api/chats` and `/api/settings/*` return 401.
3. `/sw.js`, `/manifest.webmanifest` and `/icons/icon-192.png` load.
4. Signed in: Settings → the active provider's **Test connection** succeeds, a
   chat streams a reply and reappears in the sidebar after a reload, and the
   Memory and Tasks pages load.

## Rollback

Redeploy the previous commit from Dokploy. Code changes never migrate data
destructively: the SQLite files add tables and columns only. A backup of the
pre-polish image and workflow archive from 22 September 2026 is kept on the
VPS under `/root/aegentica-backups/20260922-before-polish`.

## Orchestration release gate

The next product release adds saved agent profiles, eve-native delegation, main-chat attachments, a private image library, global search and a capability directory. It shipped as `orchestration-2026-09-23`; `polish-2026-09-24` added eve 0.66.2, file sharing from the Android share sheet, app icon badges, keyboard-aware layout and a conversation picker on Activity; the current identifier is `polish-2026-09-24b` (errors no longer cover the phone top bar and link to Settings when a key is missing, one search control per layout, readable capability rows, a compact Activity toolbar). Use [RELEASE_VERIFICATION](./RELEASE_VERIFICATION.md) for current checks and domain gates. This entry describes code scope, not a claim that a deployment or real model turn has already passed.
