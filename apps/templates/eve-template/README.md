# Ægentica

Ægentica is a personal AI agent you own. It is the successor to sol0: one private assistant for one operator, reachable as an installable web app on phone and desktop and through Telegram, running on your own server at [ai-chat.se](https://ai-chat.se).

It is built on [eve](https://eve.dev), Vercel's framework for durable agents, and starts from eve's official `eve-chat-template`. eve supplies the hard parts sol0 had to hand-build: durable sessions that survive a closed tab or a device switch, approvals, memory, schedules, subagents, sandboxed tools and channels. Ægentica adds the product layer on top and keeps eve's defaults wherever they exist.

## What it does

| Area             | What you get                                                                                                                               | Docs                                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| Chat             | Streaming chat that resumes after refresh, stop, attachments, reasoning and tool cards, approvals and questions                            | [how-the-chatbot-works](./docs/how-the-chatbot-works.md)   |
| Models           | Vercel AI Gateway or OpenRouter, keys saved encrypted in Settings, instant switching, full model catalog picker                            | [SELF_HOSTING](./docs/SELF_HOSTING.md)                     |
| Everywhere       | Installable app (PWA), notifications, chat history stored on the server so every device sees the same chats                                | [WEB_APP](./docs/WEB_APP.md)                               |
| Images and voice | Image creation with the active provider, shown in the chat; dictation in the message box; replies read aloud with a chosen voice and speed | [WEB_APP](./docs/WEB_APP.md#images-and-voice)              |
| Memory           | Long-term memory shared by app, Telegram and tasks; see, edit and import it on the Memory page                                             | [WEB_APP](./docs/WEB_APP.md#memory)                        |
| Tasks            | Reminders, briefings and recurring jobs; each run is saved as a chat and sent as a notification                                            | [WEB_APP](./docs/WEB_APP.md#tasks)                         |
| GitHub           | Repositories, pull requests, issues and failing checks through the official GitHub tools extension; every change asks first                | [GITHUB](./docs/GITHUB.md)                                 |
| Skills           | Research, pull-request review, failing-check investigation, daily briefing, deep research, trip planning                                   | [agent/skills](./agent/skills)                             |
| Telegram         | Optional private bot linked to your account, same agent and memory                                                                         | [TELEGRAM_AND_SCHEDULES](./docs/TELEGRAM_AND_SCHEDULES.md) |
| Tools            | Web search and fetch, a sandbox with bash and files, subagents (researcher, reviewer), workflows                                           | [EVE_FEATURE_MATRIX](./docs/EVE_FEATURE_MATRIX.md)         |

Where this stands against the original sol0 vision, and what comes next, is in [VISION](./docs/VISION.md).

## App pages

- `/` and `/chat/[id]`: chat
- `/tasks`: scheduled tasks
- `/memory`: long-term memory
- `/settings`: Models (providers and model), Voice, App & notifications (install and notifications), Integrations (built-in tools, GitHub, Telegram, work apps)
- `/capabilities`: what the running agent can do (Active), what this repository includes (Included), and what eve can install (Available)
- `/native`: eve's current official `channel/web` scaffold, kept as a reference surface
- `/session`: inspect and control durable sessions
- `/library`: product guide

## Run it

Requirements: Node.js 24+ (the app uses `node:sqlite`) and pnpm.

```bash
pnpm install
cp .env.example .env.local   # set EVE_CHAT_USERNAME, EVE_CHAT_PASSWORD, EVE_SESSION_SECRET, EVE_MEMORY_DIR
pnpm dev                     # Next.js app and eve agent together (withEve)
```

Production (single container, as on ai-chat.se): `pnpm build:eve && pnpm build`, then `pnpm start`. The start script supervises Next.js and the eve runtime. Deployment, volumes and environment are covered in [SELF_HOSTING](./docs/SELF_HOSTING.md) and [production-release](./docs/production-release.md). The Vercel deployment mode inherited from the chat template (Neon, Upstash, Sign in with Vercel) is in [setup-and-deploy](./docs/setup-and-deploy.md).

## Checks

```bash
pnpm typecheck
node scripts/test-chat-store.mjs
node scripts/test-telegram-and-schedules.mjs
node scripts/test-provider-settings.mjs
node scripts/test-openrouter-model.mjs
node scripts/test-github-settings.mjs
node scripts/test-memory-store.mjs         # Node 24
node scripts/test-push-and-task-runner.mjs # Node 24
node scripts/test-image-generation.mjs     # Node 24
pnpm eval                                  # eve evals
```

## How it relates to eve

The app is a product shell over eve, never a second runtime ([ARCHITECTURE](./docs/ARCHITECTURE.md)). Upstream code wins over custom code: eve defaults stay defaults, registry items are mounted rather than copied, and custom code exists only for product UI and glue eve does not supply ([UPSTREAM](./docs/UPSTREAM.md)). UI changes follow [DESIGN](./docs/DESIGN.md), which keeps the look of an official Vercel product.

The repository is also a complete reference for eve's public surface: every official capability is either active, included as an example, or listed as installable, with the contract in [EVE_FEATURE_MATRIX](./docs/EVE_FEATURE_MATRIX.md). `pnpm eve:surface` regenerates `lib/eve-surface.generated.ts` from the eve package and registry; `pnpm eve:surface:check` fails when it is stale.

### Materialize inside the eve monorepo

From a checkout of `vercel/eve`:

```bash
node /path/to/eve-template-overlay/scripts/materialize-eve-template.mjs .
cd apps/templates/eve-template
pnpm install && pnpm typecheck && pnpm build:eve && pnpm build && pnpm eval
```

## Security defaults

- One operator account (password login, signed session cookie); settings APIs require that session, same-origin requests, bounded bodies and a rate limit.
- Provider keys, GitHub and Telegram tokens and notification keys are stored AES-256-GCM encrypted and never returned to the browser.
- Tools that change the outside world (GitHub writes, the sandbox `write_file`) require approval, and the scheduled-task tools only work for the operator.
- The custom demo channel is off unless `EVE_TEMPLATE_DEMO_CHANNEL_TOKEN` is set; the MCP channel only runs locally.
- Registry integrations are listed but not activated without credentials.
