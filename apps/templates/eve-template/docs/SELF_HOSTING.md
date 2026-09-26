# Self-hosting: environment and model providers

Ægentica can run its models through **Vercel AI Gateway** or **OpenRouter**. Both
keys can be saved at once; one provider is active. Switching provider, replacing
a key or choosing another model applies to the next model call. Nothing is
rebuilt, redeployed or restarted, and running conversations continue on the new
setting from their next step.

The installable app, notifications, the Tasks and Memory pages and server-side
chat history are covered in [WEB_APP.md](./WEB_APP.md); GitHub in
[GITHUB.md](./GITHUB.md); Telegram and the scheduler in
[TELEGRAM_AND_SCHEDULES.md](./TELEGRAM_AND_SCHEDULES.md); releasing to
aegentica.se (with its aliases www.aegentica.se and ai-chat.se) in
[production-release.md](./production-release.md).

## Deployment environment (Dokploy)

Production is one container built from the repository's `Dockerfile` and started
by `scripts/start-self-hosted.mjs` (Next.js plus the eve runtime). Mount a
persistent volume at `/app/.eve/.workflow-data`; what lives on it is listed in
[production-release.md](./production-release.md#what-lives-on-the-volume).

### User and file ownership

The container starts as root only long enough to prepare its data, then both
servers run as the image's unprivileged `node` user (uid 1000, home
`/home/node`). The code under `/app` stays root-owned and read-only, so neither
the app nor the agent's tools can change it. On every start
`scripts/start-self-hosted.mjs`, as root:

1. gives `node` the directories the servers write to, and removes group and
   other permissions there: `.eve` (which holds the volume), `.next/cache`, and
   the directories of `EVE_SETTINGS_DIR`, `EVE_MEMORY_DIR` and `EVE_CHAT_DB_PATH`
   when they are set. It never follows symbolic links and never touches `/`, a
   system directory or `/app` itself. An existing volume full of root-owned
   files from an earlier image is re-owned automatically; nothing is copied or
   deleted.
2. sets `HOME=/home/node` and switches to `node` before starting the servers.
3. sets the umask to `077`, so every file the servers create (settings, chats,
   run records) is readable by that user only. This also applies when the
   script is started as a normal user (local runs, CI).

If any step fails (for example a read-only mount), the log says
`WARNING: still running as root` with the reason, and the app starts as root
as before: availability first. Fix the cause and restart.

With `NODE_ENV=production` (the image) the script also refuses to start when
`AEGENTICA_TEST_MODEL` is set, and warns (without stopping) when
`EVE_SESSION_SECRET` is missing or shorter than 32 characters, or when neither
`EVE_CHAT_PASSWORD` nor a password saved in Settings exists.

**Rolling back.** Deploy the previous image (see
[production-release.md](./production-release.md#rollback)). It runs as root,
which can read the re-owned files, so no ownership change is needed. The
volume can be handed back to root with
`docker run --rm --user 0 -v eve-chat-data:/d --entrypoint chown <image> -R 0:0 /d`,
but nothing requires it.

Set at runtime (only `EVE_SESSION_SECRET` is enforced):

| Variable             | Purpose                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EVE_SESSION_SECRET` | 32+ random bytes. Signs the operator session and derives the key that encrypts saved settings. Without it password sign-in fails closed. Keep it with the volume: a new secret makes saved keys and tokens unreadable.        |
| `EVE_CHAT_USERNAME`  | Operator username (`Riki` when unset).                                                                                                                                                                                        |
| `EVE_CHAT_PASSWORD`  | Strongly recommended (see below). Initial operator password (16+ characters). A password changed in Settings > Security is saved on the volume and wins over this value.                                                      |
| `EVE_MEMORY_DIR`     | Long-term memory directory, directly inside the volume (for example `/app/.eve/.workflow-data/profile-memory`). Its parent holds `settings/` and `chats.sqlite`, so the parent must be the volume. Without it, memory is off. |
| `BETTER_AUTH_URL`    | Public origin, `https://aegentica.se`: the auth origin and the contact in push notifications.                                                                                                                                 |

Without `EVE_CHAT_USERNAME` and `EVE_CHAT_PASSWORD` the app still starts, with
the temporary sign-in `Riki` / `1010` from the
[password starter](./setup-and-deploy.md#password-starter), which anyone can
guess. Set both, or sign in once and change the password in Settings > Security
right away.

Build time: `NEXT_PUBLIC_SITE_URL` (Docker build argument, default
`https://aegentica.se`) is the origin in link previews. Next.js inlines it when
the image is built, so setting it on the running container changes nothing.

Optional:

| Variable                                                                      | Default and purpose                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AI_GATEWAY_API_KEY`, `OPENROUTER_API_KEY`                                    | Provider keys used when none is saved in Settings ([Environment fallback](#environment-fallback)).                                                                                    |
| `GITHUB_TOKEN`                                                                | GitHub tools token when none is saved in Settings > GitHub.                                                                                                                           |
| `AEGENTICA_TIMEZONE`                                                          | `Europe/Stockholm`. Time zone for scheduled tasks and the agent's clock.                                                                                                              |
| `AEGENTICA_IMAGE_MODEL`                                                       | `openai/gpt-image-1-mini`. Model for image creation.                                                                                                                                  |
| `EVE_SETTINGS_DIR`                                                            | `settings/` beside `EVE_MEMORY_DIR`. Encrypted settings directory.                                                                                                                    |
| `EVE_CHAT_DB_PATH`                                                            | `chats.sqlite` beside `EVE_MEMORY_DIR`. Chat history file.                                                                                                                            |
| `PORT`, `NEXT_HOST`                                                           | `3000`, `0.0.0.0`. Where Next.js listens; the image's health check follows `PORT`.                                                                                                    |
| `EVE_NEXT_PRODUCTION_PORT`                                                    | `4274`. The eve runtime's port, on 127.0.0.1 only. Next.js bakes it into its /eve proxy at build time, so build and run with the same value.                                          |
| `SLACK_CONNECTOR`, `LINEAR_CONNECTOR`, `NOTION_CONNECTOR`, `SENTRY_CONNECTOR` | Unset. Vercel Connect connector IDs ([setup-and-deploy](./setup-and-deploy.md#optional-vercel-connect-integrations)); the composer's connections menu needs Linear, Notion or Sentry. |
| `EVE_TEMPLATE_DEMO_CHANNEL_TOKEN`                                             | Unset. Turns on the token-protected demo channel.                                                                                                                                     |
| `AEGENTICA_EXAMPLES`                                                          | Unset (off in production). `1` adds the reference example tools and the Petstore connection to the agent; `pnpm eval` sets it.                                                        |

Leave the Vercel-mode variables (`DATABASE_URL`, `BETTER_AUTH_SECRET`, the Vercel
App client, Upstash and `EVE_MEMORY_BLOB_*`) unset on Dokploy. Never set
`AEGENTICA_TEST_MODEL` on a deployment: it replaces every reply with eve's
scripted test model, so the image refuses to start with it.

## Settings

Sign in as the password operator and open `/settings`. Each provider has its own
card:

- **Save key** encrypts and stores the key, then makes that provider active.
  An OpenRouter key (`sk-or-…`) pasted into the AI Gateway card, or the reverse,
  is rejected with a hint instead of being stored.
- **Use AI Gateway / Use OpenRouter** switches the active provider. It needs a
  key for that provider.
- **Test connection** sends one short request (`Reply with OK.`) to the selected
  model on that provider, then shows the remaining balance when the provider
  reports one: AI Gateway `GET /v1/credits`, OpenRouter `GET /api/v1/key`. The
  test may use a few tokens. Rejected keys, missing credits, rate limits and
  unsupported models get specific messages; raw provider errors and keys are
  never returned.
- **Remove saved key** deletes the app-saved key. The server environment key,
  if any, applies again.

The provider switch is also in the model picker, so the operator can change
provider without leaving the chat. Viewers who are not the password operator see
the active provider's models but cannot switch.

### Environment fallback

| Provider   | Environment variable | Precedence                              |
| ---------- | -------------------- | --------------------------------------- |
| AI Gateway | `AI_GATEWAY_API_KEY` | App-saved key first, then this variable |
| OpenRouter | `OPENROUTER_API_KEY` | App-saved key first, then this variable |

Without an explicit choice in Settings, the first provider with a usable key is
active (AI Gateway before OpenRouter).

### Storage and security

Keys are encrypted with AES-256-GCM using a key derived from
`EVE_SESSION_SECRET` and written atomically with owner-only permissions to
`settings/gateway.enc` and `settings/openrouter.enc` beside the workflow data
(`EVE_SETTINGS_DIR` overrides the directory). The active choice is
`settings/provider.json`. Keys are never returned by the API, displayed again or
stored in the browser. The settings API requires the operator session, same-origin
POSTs, bounded request bodies and a per-process rate limit.

Keep `EVE_SESSION_SECRET` with the persistent volume. If it changes, saved keys
become unreadable: Settings shows this per provider, and **Remove saved key**
clears the unreadable file so you can save the key again. The other provider is
unaffected.

## Model picker

The composer and Settings share one picker. It lists the active provider's live
catalog, filtered to models this agent can actually run (text in, text out and
tool calling), grouped as **Recent**, **Recommended** and **All models**, where
each maker is one row with its logo and model count that opens its models on a
click or Enter (so opening the picker renders a few dozen rows, not the whole
catalog). Each model row shows the model ID, context window, price per million
input/output tokens, and reasoning or vision support. Search covers the whole
catalog by name, ID and maker, best matches first (the top 40, with a row that
shows the rest); arrow keys and Enter select. The list itself
(`components/chat/model-picker-list.tsx`) loads when the browser is idle or the
picker first opens, so pages with a composer do not ship it up front.

Catalogs come from `https://ai-gateway.vercel.sh/v1/models` and
`https://openrouter.ai/api/v1/models`, are cached on the server for five minutes,
and fall back to a bundled snapshot (`lib/model-catalogs.snapshot.json`) when a
provider is unreachable. Refresh the snapshot with
`node scripts/sync-model-catalogs.mjs`.

The browser remembers the chosen model ID and the last five picks, and sends the
choice with each message in `x-aegentica-model`. Many IDs exist on both providers
(for example `anthropic/claude-sonnet-5`), so switching provider keeps your model
when it can. When the active provider does not offer it, the turn uses that
provider's default (`openai/gpt-5.6-luna-fast` on AI Gateway,
`openai/gpt-5.6-luna` on OpenRouter) and the picker says so.

## How routing works

`agent/lib/routed-model.ts` is an eve dynamic model resolved at `step.started`,
the only scope that may return a live provider model object. On each model step
it reads the active provider and key from the settings directory, resolves the
requested model against that provider's catalog, and returns:

- AI Gateway: `createGateway({ apiKey })(modelId)` from the AI SDK.
- OpenRouter: `openRouterModel()` in `lib/openrouter-model.ts`, built on
  `@openrouter/ai-sdk-provider`, with reasoning effort `high` for models that
  support reasoning (OpenRouter takes reasoning as a model setting, not a call
  option).

eve attaches AI Gateway's provider-executed search (`gateway.exa_search`) as
`web_search` to every dynamically selected model. OpenRouter cannot run that
tool, so the OpenRouter model swaps it for OpenRouter's own
`openrouter:web_search` server tool (up to 10 results). Web search therefore
works on both providers; OpenRouter bills its searches separately.

Each selection includes the model's context window from the catalog, which eve
uses for compaction. The root agent and its delegated copies follow the composer
choice; the reviewer prefers `anthropic/claude-sonnet-5` for an independent
second opinion. The operator's picks are also saved on the server
(`settings/provider.json`), so Telegram and scheduled tasks, which have no
browser, use the last picked model, then the provider default.

The session cost limit (`maxTokenCostUsdPerSession`, $25) works on both
providers: eve reads cost from AI Gateway metadata, so the OpenRouter model
mirrors OpenRouter's reported per-call cost into that field.

The `conditional-helper` demo subagent is never enabled in this app. eve
requires a fixed model for dynamic subagents, so it still uses an AI Gateway
model ID.

## Checks

`pnpm test` covers provider auth, CSRF, storage, switching and fail-closed
behavior (`scripts/test-provider-settings.mjs`), catalogs and picker preference
(`scripts/test-models.mjs`) and the OpenRouter request shape
(`scripts/test-openrouter-model.mjs`).

`node scripts/check-model-routing.mjs` runs against a live app (`CHECK_ORIGIN`,
`EVE_CHAT_USERNAME`, `EVE_CHAT_PASSWORD`). For every provider with a key it
switches provider, sends one message and asserts that eve's `step.started`
event used the requested model on that provider. With real keys this sends real,
token-consuming requests. With placeholder keys each provider must reject the
key, which still proves the request reached the right provider.

Storage, deployment and domains are in [production-release](./production-release.md) and [release verification](./RELEASE_VERIFICATION.md).
