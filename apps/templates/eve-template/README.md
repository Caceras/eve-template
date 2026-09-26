# Ægentica

![Ægentica mark](./public/aegentica.svg)

Ægentica is a personal AI agent you own. It is the successor to sol0: one private assistant for one operator, reachable as an installable web app on phone and desktop and through Telegram, running on your own server at [aegentica.se](https://aegentica.se) (also reachable at [ai-chat.se](https://ai-chat.se)).

It is built on [eve](https://eve.dev), Vercel's framework for durable agents, and starts from eve's official `eve-chat-template`. eve supplies the hard parts sol0 had to hand-build: durable sessions that survive a closed tab or a device switch, approvals, memory, schedules, subagents, sandboxed tools and channels. Ægentica adds the product layer on top and keeps eve's defaults wherever they exist.

## What it does

| Area             | What you get                                                                                                                                                                                                                                                                | Docs                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Chat             | Streaming chat that resumes after refresh, stop, attachments, reasoning and tool cards, approvals and questions, rename and delete                                                                                                                                          | [how-the-chatbot-works](./docs/how-the-chatbot-works.md)   |
| Models           | Vercel AI Gateway or OpenRouter, keys saved encrypted in Settings, instant switching, full model catalog picker                                                                                                                                                             | [SELF_HOSTING](./docs/SELF_HOSTING.md)                     |
| Everywhere       | Installable app (PWA) that receives text, photos and PDFs from the Android share sheet and the desktop's Open with menu, native back gesture, long-press and keyboard shortcuts, notifications, chat history stored on the server so every device sees the same chats       | [WEB_APP](./docs/WEB_APP.md)                               |
| Images and voice | Image creation with the active provider, shown in the chat and sent to Telegram as photos; dictation in the message box; replies read aloud with an OpenRouter voice (Gemini, Grok, MAI-Voice, Voxtral, …) chosen in Settings, or the device's own voice, at a chosen speed | [WEB_APP](./docs/WEB_APP.md#images-and-voice)              |
| Memory           | Long-term memory shared by app, Telegram and tasks; see, edit and import it on the Memory page                                                                                                                                                                              | [WEB_APP](./docs/WEB_APP.md#memory)                        |
| Tasks            | Reminders, briefings and recurring jobs; each run is saved as a chat and sent as a notification                                                                                                                                                                             | [WEB_APP](./docs/WEB_APP.md#tasks)                         |
| GitHub           | Repositories, pull requests, issues and failing checks through the official GitHub tools extension; every change asks first                                                                                                                                                 | [GITHUB](./docs/GITHUB.md)                                 |
| Skills           | Research, pull-request review, failing-check investigation, daily briefing, deep research, trip planning                                                                                                                                                                    | [agent/skills](./agent/skills)                             |
| Telegram         | Optional private bot linked to your account, same agent and memory                                                                                                                                                                                                          | [TELEGRAM_AND_SCHEDULES](./docs/TELEGRAM_AND_SCHEDULES.md) |
| Tools            | Web search and fetch, a sandbox with bash and files, delegation to copies of the agent, an independent reviewer, workflows                                                                                                                                                  | [EVE_FEATURE_MATRIX](./docs/EVE_FEATURE_MATRIX.md)         |

Where this stands against the original sol0 vision, and what comes next, is in [VISION](./docs/VISION.md).

## App pages

- `/` and `/chat/[id]`: chat
- `/agents`: encrypted saved profiles, creation, editing, duplication and chat selection
- `/images`: private generated image library
- Cmd/Ctrl+K: global pages, actions and recent-chat search
- `/tasks`: scheduled tasks
- `/memory`: long-term memory
- `/settings`: Models (providers and model), with `/settings/voice`, `/settings/notifications` (install and notifications), `/settings/integrations` (Connections: built-in tools, GitHub, Telegram, work apps) and `/settings/security` (password)
- `/capabilities`: live runtime declarations (not credential tests), what this repository includes (Included), and what eve can install (Available)
- `/native`: eve's current official `channel/web` scaffold, kept as a reference surface
- `/session` (Activity): pick a conversation (or paste a session ID) to inspect its durable event stream and cancel, compact, clear or reset it
- `/library`: product guide

## Run it

Requirements: Node.js 24+ (the app uses `node:sqlite`) and pnpm.

```bash
pnpm install
cp .env.example .env.local   # set EVE_CHAT_USERNAME, EVE_CHAT_PASSWORD, EVE_SESSION_SECRET, EVE_MEMORY_DIR
pnpm dev                     # Next.js app and eve agent together (withEve)
```

Production (single container, as on aegentica.se): `pnpm build:eve && pnpm build`, then `pnpm start`. The start script supervises Next.js and the eve runtime. The environment and volume are in [SELF_HOSTING](./docs/SELF_HOSTING.md#deployment-environment-dokploy); deploying and verifying a release is in [production-release](./docs/production-release.md), which also covers the nightly backups the app keeps on the volume and how to restore them. The Vercel deployment mode inherited from the chat template (Neon, Upstash, Sign in with Vercel) is in [setup-and-deploy](./docs/setup-and-deploy.md).

## Checks

```bash
pnpm check        # all regression scripts (node --test), lint, format check and typecheck
pnpm check:full   # the CI release check: builds, then browser acceptance against an isolated server
pnpm qa:tour      # screenshots every route, a mock conversation and the phone drawer, light and dark, against a local server
pnpm eval         # eve evals
```

Browser checks run real chat turns with eve's deterministic mock model (`AEGENTICA_TEST_MODEL=mock`), so they need no provider key. Never set that variable on a deployment; with `NODE_ENV=production` the start script refuses it.

## How it relates to eve

The app is a product shell over eve, never a second runtime ([ARCHITECTURE](./docs/ARCHITECTURE.md)). Upstream code wins over custom code: eve defaults stay defaults, registry items are mounted rather than copied, and custom code exists only for product UI and glue eve does not supply ([UPSTREAM](./docs/UPSTREAM.md)). UI changes follow [DESIGN](./docs/DESIGN.md), which keeps the look of an official Vercel product.

The repository is also a complete reference for eve's public surface: every official capability is either active, included as an example, or listed as installable, with the contract in [EVE_FEATURE_MATRIX](./docs/EVE_FEATURE_MATRIX.md). `pnpm eve:surface` regenerates `lib/eve-surface.generated.ts` from the eve package and registry; `pnpm eve:surface:check` fails when it is stale.

This repository holds only the app; eve comes from npm. The official chat template it started from lives in `vercel/eve` (`apps/templates/eve-chat-template`); `pnpm upstream:sync` fetches it into `node_modules/.cache/` so `pnpm test` can check every divergence against it.

## Security defaults

- One operator account (password login, signed session cookie). Signing out revokes that cookie on the server, Settings > Security can sign out everywhere, and a browser that signed in before is never locked out by other addresses' failed sign-ins.
- Settings APIs require that session, same-origin requests, bounded bodies and a rate limit; eve's session API takes a write with that cookie only from the app's own origin. Signed out, `/api/bootstrap` tells only whether and how to sign in.
- Provider keys, GitHub and Telegram tokens and notification keys are stored AES-256-GCM encrypted and never returned to the browser.
- Tools that change the outside world (GitHub writes, the sandbox `write_file`) require approval, the scheduled-task tools only work for the operator, and deleting a task asks first.
- The container's servers run as the unprivileged `node` user with owner-only data files; the code is read-only to them.
- The eve runtime listens on 127.0.0.1 only, and its internal workflow queue is never exposed through the app. The agent's bash sandbox reaches the internet but not loopback, private or cloud-metadata addresses. Unsigned Telegram and Slack webhook calls stop at the app, and the scheduled-task token is accepted on loopback only.
- Every response carries baseline security headers (no framing by other sites, HTTPS only, no MIME sniffing, images only from the app itself). A picture in a reply that points to another site shows as a link to open, never loads by itself.
- The custom demo channel is off unless `EVE_TEMPLATE_DEMO_CHANNEL_TOKEN` is set; the MCP channel only runs locally; demo tools stay out of production chats.
- Registry integrations are listed but not activated without credentials: Linear, Notion and Sentry reach the model only when their connector is configured.
- Pages tell search engines not to index or follow them (`noindex, nofollow`); there is deliberately no robots.txt `Disallow`, so crawlers can read that and link previews keep working.

## Orchestration release

Create saved agents without a model key, pick them with `@` in the message box or ask the root agent to delegate work to a copy of itself through an eve workflow. `/` lists every skill the runtime reports (Chat lets the agent choose); the box also takes images, PDFs and text attachments; Images is an authenticated gallery on the existing volume. Provider/model switching, approvals, memory, tasks, voice controls and all existing routes remain available.

This is one operator workspace, not independent tenants or arbitrary generated deployments. Read [Agents and orchestration](./docs/AGENTS_AND_ORCHESTRATION.md), [release verification](./docs/RELEASE_VERIFICATION.md) and [DESIGN](./docs/DESIGN.md). The primary domain is `aegentica.se`; `ai-chat.se` stays as an alias of the same application.
