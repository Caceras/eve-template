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
hook and a `webhookVerifier`:

- Only private chats are accepted. Group messages and other bots are dropped.
- Only the linked Telegram user reaches the agent. Everyone else is ignored
  without starting a session or spending tokens; an unlinked bot answers
  `/start` with a one-line notice.
- Approval and question buttons answer only for the linked user. eve accepts a
  button press without checking who sent it, so the verifier drops presses
  from any other account, including one that was unlinked while its chat still
  shows the buttons.
- Webhooks without the matching secret header are rejected (eve's own
  secret-token check, run by the verifier) before any hook runs, including when
  Telegram is not connected. A request without the header at all, or over
  1 MB, does not even reach eve: `proxy.ts` answers 401 or 413 (the same for
  `/eve/v1/slack` and its `x-slack-signature`).
- Pairing codes are six digits, work once, expire after 10 minutes and are
  discarded after five wrong attempts.

The linked user runs as the operator principal (`lib/operator.ts`). Memory is
scoped to the operator, so Telegram, the web app and scheduled tasks share the
same remembered facts; password-login sessions keep the memory scope they had
before Telegram existed. Telegram turns use the model last picked in the web
picker (saved on the server) on the active provider.

eve's Telegram channel supplies typing indicators, replies split at Telegram's
4096-character limit, inline-keyboard buttons for approvals and questions, and
photo/document uploads (images, PDF and text up to 10 MB). A message the agent
cannot read (a voice note, sticker, video, audio, another file type or a file
over 10 MB, with no text or caption) gets a one-line reply saying what works,
instead of an empty turn. Pictures the agent makes with `generate_image` are
sent to the chat as photos (`sendPhoto`, `lib/generated-images.ts`); a
scheduled task's Telegram message says when its result has a picture in the
app.

## Scheduled tasks

Create tasks on the **Tasks** page (`/tasks`) or ask in chat: "remind me
tomorrow at 9 to call Anna" or "every weekday at 8, send me a short brief". In
chat, the agent uses four tools:

| Tool                    | Purpose                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `schedule_task`         | Create a one-time (`runAt`, ISO 8601 with offset) or recurring (`cron`, 5 fields) task, once confirmed |
| `list_scheduled_tasks`  | Show tasks, next run and last result                                                                   |
| `update_scheduled_task` | Pause (`enabled: false`), resume or rename a task; changing what or when it runs is confirmed first    |
| `delete_scheduled_task` | Delete a task, after the operator confirms                                                             |

The tools use an eve approval policy (`agent/lib/operator-only.ts`) that
denies anyone but the operator. Creating a task, deleting one, and changing a
task's instructions, skill, schedule or time zone also ask the operator to
confirm, because text the agent reads (a web page, an issue) must not be able
to plant, rewrite or remove unattended work on its own; pausing, resuming,
renaming and listing run at once. A scheduled run has nobody to confirm, so a
run that tries to create or rewrite a task stops at the approval and ends as
"waiting": the notification opens its chat, where the operator can approve or
cancel.

Recurring schedules are evaluated in the task's IANA time zone, `Europe/Stockholm` by default
(`AEGENTICA_TIMEZONE` overrides it), so "08:00" follows daylight saving time. A
turn-scoped context line (`agent/instructions/clock.ts`) gives the agent the
current local time so it can resolve relative dates. It is left out of the turn
that carries out an answered approval (`agent/lib/resumed-approval.ts`): the
approved call runs only while the answer is the conversation's last message.

Limits: 50 active tasks, recurring tasks at most every 15 minutes, prompts up to
4,000 characters, and every task keeps instructions or a skill. At the spring
clock change a run the clock skips moves to the next valid time and runs once,
so hourly and quarter-hourly schedules can be created and resumed in the days
before it. Finished one-time tasks are kept for 30 days.

### How dispatch works

This follows eve's [dynamic scheduling](../public/reference/patterns/dynamic-scheduling.md)
pattern. `agent/schedules/scheduled-tasks.ts` is a handler-form schedule that
runs every minute in the eve process (Nitro's scheduled task runner, started by
`eve start`). Each tick it leases due tasks, up to four running at once, from the
encrypted `settings/schedules.enc` store under a cross-process file lock, then
`lib/task-runner.ts` runs each one:

1. It starts an ordinary eve session over the local HTTP API
   (`127.0.0.1`, eve client SDK), authenticated as the operator with an internal
   HMAC token derived from `EVE_SESSION_SECRET` (`lib/internal-auth.ts`; the
   public app drops that header, so it only works on loopback), and records the
   session id with the task's lease.
2. It waits up to 10 minutes for the session to settle, including background
   work the turn started (a delegated saved agent, a background review): eve
   reports that work in a later turn of the same session, and the run ends with
   that report rather than the "I started it" reply. Runs use eve's `cohort`
   task delivery, like eve's own schedules, so the results arrive together.
3. It saves the session's events as a new chat titled after the task (streamed
   text joined into whole blocks, like the web chat's own saves), so the result
   appears in the sidebar on every device and the conversation can be continued.
4. It sends a Web Push notification (the final answer's first lines; text the
   agent writes before a tool call is not the answer) that opens that chat, and
   mirrors the answer to Telegram when a Telegram account is linked. A check
   with nothing to report can end on eve's `<eve-empty-delivery/>` marker (the
   run's prompt says so): its chat is saved, but nothing is sent.

Success records the chat (**View latest result** on the Tasks page) and
computes the next run. Only a session that could not be started is retried:
after 5 minutes, and after three failures a recurring task moves to its next
slot. Once the session has started the run is never started again. A run that
times out (it and its background work are cancelled), loses its connection or
cannot be saved is recorded as failed and reported with the reason. If the eve
process restarts mid-run, the lease expires after 15 minutes and the next tick
attaches to the same session, then saves and reports its result.

**Run now** makes a task due immediately; the next tick (within a minute) runs
it. Run now pressed while a run is in flight queues one more run, and a new time
given to a task during its own run stands instead of being overwritten when
the run finishes.

A task can name a skill (the Tasks form lists the runtime's skills, and
`schedule_task` accepts `skill`). The runner sends it in the same
`x-aegentica-skill` header the composer uses, so each run loads that skill; with
a skill, the instructions are optional extra guidance. An empty Tasks page
offers each skill as a starting point.

## Checks

```sh
node scripts/test-telegram-and-schedules.mjs
```

covers the operator identity and memory scope, schedule validation, time-zone
math (including the spring clock change), exclusive leases, retries, Run now and
new times during a run, the Tasks API (create, edit, run now, pause,
resume, delete; auth and same-origin), Telegram connect, webhook secret, pairing
limits and disconnect, and drives the Telegram channel's webhook route: button
presses from other accounts, the notice for unsupported content and generated
images sent as photos. `scripts/test-push-and-task-runner.mjs` runs the task
runner against a fake eve session API: the saved chat, background work followed
to its report, quiet checks, timeouts, failures after the session started and a
restart attaching to the running session.

`scripts/check-telegram-e2e.mjs` drives a running app end to end: forged
webhook rejection, deep-link pairing, a stranger being ignored, an owner message
starting an agent session, and a scheduled task dispatched by the real
one-minute schedule and mirrored to Telegram. Run the app with `FAKE_TELEGRAM_LOG` set and a Node
`--import` preload that answers `api.telegram.org` calls locally, so no real bot
is needed.

## Relationship to saved agents

The new Agents UI and composer profile selection are for the password-authenticated web operator. A web profile is not automatically assigned to Telegram, Slack or a scheduled task. These channels retain their existing shared operator identity, memory, default model and approval behavior. They may invoke operator-only saved-agent tools when those tools are actually present in their compiled surface. No new background runner or channel is created by saving a profile.
