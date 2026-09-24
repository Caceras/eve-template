# Telegram and scheduled tasks

The web app (installable, with notifications, see [WEB_APP.md](./WEB_APP.md)) is
Ægentica's main channel. A Telegram bot is an optional second one: a private
chat with the same agent and memory. Scheduled tasks (reminders, daily briefs,
recurring checks) run on their own, save each result as a web chat, notify the
operator's devices and, when Telegram is linked, mirror the answer there.

## Connect Telegram

1. In Telegram, open [@BotFather](https://t.me/BotFather), send `/newbot`, pick a
   name and copy the token.
2. In Ægentica **Settings → Connections → Telegram**, paste the token and press **Connect bot**.
   Ægentica checks it with `getMe`, generates a random webhook secret and calls
   `setWebhook` for `https://<this site>/eve/v1/telegram`. No redeploy or
   environment variable is needed. The public URL comes from `BETTER_AUTH_URL`
   when set, otherwise from the verified Settings request, and must be HTTPS.
3. Press **Link my Telegram**, then **Open Telegram and tap Start** (or send
   `/link 123456` to the bot). The page updates when the account is linked.

The bot token, webhook secret and linked account are stored AES-256-GCM
encrypted in `settings/telegram.enc`, like the provider keys. **Send test
message** posts to the linked chat without a model call. **Unlink account**
keeps the bot; **Disconnect bot** also removes the webhook.

### Who can talk to the bot

`agent/channels/telegram.ts` wraps eve's `telegramChannel` with an `onMessage`
hook:

- Only private chats are accepted. Group messages and other bots are dropped.
- Only the linked Telegram user reaches the agent. Everyone else is ignored
  without starting a session or spending tokens; an unlinked bot answers
  `/start` with a one-line notice.
- Webhooks without the matching secret header are rejected by eve before any
  hook runs, including when Telegram is not connected.
- Pairing codes are six digits, work once, expire after 10 minutes and are
  discarded after five wrong attempts.

The linked user runs as the operator principal (`lib/operator.ts`). Memory is
scoped to the operator, so Telegram, the web app and scheduled tasks share the
same remembered facts; password-login sessions keep the memory scope they had
before Telegram existed. Telegram turns use the model last picked in the web
picker (saved on the server) on the active provider.

eve's Telegram channel supplies typing indicators, replies split at Telegram's
4096-character limit, inline-keyboard buttons for approvals and questions, and
photo/document uploads (images, PDF and text up to 10 MB).

## Scheduled tasks

Create tasks on the **Tasks** page (`/tasks`) or ask in chat: "remind me
tomorrow at 9 to call Anna" or "every weekday at 8, send me a short brief". In
chat, the agent uses four tools:

| Tool                    | Purpose                                                                                |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `schedule_task`         | Create a one-time (`runAt`, ISO 8601 with offset) or recurring (`cron`, 5 fields) task |
| `list_scheduled_tasks`  | Show tasks, next run and last result                                                   |
| `update_scheduled_task` | Change, pause (`enabled: false`) or resume a task                                      |
| `delete_scheduled_task` | Delete a task                                                                          |

The tools use an eve approval policy (`agent/lib/operator-only.ts`) that lets
the operator's calls through and denies anyone else. Recurring schedules are
evaluated in the task's IANA time zone, `Europe/Stockholm` by default
(`AEGENTICA_TIMEZONE` overrides it), so "08:00" follows daylight saving time. A
turn-scoped context line (`agent/instructions/clock.ts`) gives the agent the
current local time so it can resolve relative dates.

Limits: 50 active tasks, recurring tasks at most every 15 minutes, prompts up to
4,000 characters. Finished one-time tasks are kept for 30 days.

### How dispatch works

This follows eve's [dynamic scheduling](../public/reference/patterns/dynamic-scheduling.md)
pattern. `agent/schedules/scheduled-tasks.ts` is a handler-form schedule that
runs every minute in the eve process (Nitro's scheduled task runner, started by
`eve start`). Each tick it leases up to five due tasks from the encrypted
`settings/schedules.enc` store under a cross-process file lock, then
`lib/task-runner.ts` runs each one:

1. It starts an ordinary eve session over the local HTTP API
   (`127.0.0.1`, eve client SDK), authenticated as the operator with an internal
   HMAC token derived from `EVE_SESSION_SECRET` (`lib/internal-auth.ts`), and
   waits up to 10 minutes for the turn to settle.
2. It saves the session's events as a new chat titled after the task, so the
   result appears in the sidebar on every device and the conversation can be
   continued.
3. It sends a Web Push notification (the answer's first lines) that opens that
   chat, and mirrors the answer to Telegram when a Telegram account is linked.

Success records the chat (**View latest result** on the Tasks page) and
computes the next run; a failed run retries after 5 minutes and, after three
failures, moves a recurring task to its next slot. Delivery is at least once.
**Run now** makes a task due immediately; the next tick (within a minute) runs
it.

The weekly `heartbeat` schedule remains as eve's Markdown/task-mode example; its
output is discarded by design.

## Checks

```sh
node scripts/test-telegram-and-schedules.mjs
```

covers the operator identity and memory scope, schedule validation, time-zone
math, exclusive leases, retries, the Tasks API (create, edit, run now, pause,
resume, delete; auth and same-origin), Telegram connect, webhook secret, pairing
limits and disconnect.

`scripts/check-telegram-e2e.mjs` drives a running app end to end: forged
webhook rejection, deep-link pairing, a stranger being ignored, an owner message
starting an agent session, and a scheduled task dispatched by the real
one-minute schedule and mirrored to Telegram. Run the app with `FAKE_TELEGRAM_LOG` set and a Node
`--import` preload that answers `api.telegram.org` calls locally, so no real bot
is needed.

## Relationship to saved agents

The new Agents UI and composer profile selection are for the password-authenticated web operator. A web profile is not automatically assigned to Telegram, Slack or a scheduled task. These channels retain their existing shared operator identity, memory, default model and approval behavior. They may invoke operator-only saved-agent tools when those tools are actually present in their compiled surface. No new background runner or channel is created by saving a profile.
