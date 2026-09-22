# Web app, notifications and tasks

The web app is Ægentica's main channel. It installs like a native app (a
Progressive Web App), keeps every conversation on the server, runs scheduled
tasks on its own and notifies the operator's devices when a result is ready.

## Install the app

- **Android (Chrome)**: open the site, then **Settings → This device → Install**,
  or the browser menu's **Install app**.
- **iPhone and iPad (Safari)**: tap **Share → Add to Home Screen**. Notifications
  on iOS work only from the installed app (iOS 16.4 or later).
- **Desktop (Chrome, Edge)**: the install icon in the address bar, or
  **Settings → This device → Install**.

The installed app opens in its own window with shortcuts for **New chat**,
**Tasks** and **Settings** (long-press the icon on Android). The manifest is
`app/manifest.ts`; the icons, including a maskable one for Android's adaptive
shapes, are generated from the Æ monogram by `app/icons/[file]/route.tsx`.

`public/sw.js` is a deliberately small service worker. It shows notifications,
opens the right chat when one is tapped, and serves a branded offline page
(`public/offline.html`) when a page cannot load. It does not cache the app
itself, so a deploy is visible on the next load. It is registered in production
only (`app/_components/pwa-registration.tsx`).

## Notifications

**Settings → This device → Turn on** asks the browser for permission and
registers the device for [Web Push](https://developer.mozilla.org/docs/Web/API/Push_API).
**Send test** delivers a test notification to every registered device. Turn
notifications on separately on each device that should receive them.

- The server generates its VAPID key pair on first use and stores it, with the
  device list (at most 20), AES-256-GCM encrypted in `settings/push.enc`
  (`lib/push-notifications.ts`). No push service account or environment
  variable is needed.
- Devices the push service reports as gone (HTTP 404/410) are removed
  automatically. Opening Settings re-registers the current device, so a lost
  device list heals itself.
- The notification API (`/api/settings/notifications`) requires the operator
  session and same-origin POSTs, like the other settings APIs.

## Tasks

The **Tasks** page (`/tasks`, in the sidebar) lists every scheduled task with
its schedule, next run and a link to the latest result.

- **New task**: a name, what Ægentica should do, and when: once, every day,
  every weekday, every week, or a custom cron expression. Times use the
  browser's time zone for new tasks.
- **Run now** runs a task within a minute without changing its schedule.
- **Edit**, **Pause/Resume** and **Delete** are in the row's menu.

Each run starts a normal agent session as the operator, saves it as a chat
titled after the task (so it appears in the sidebar on every device and can be
continued), sends a notification that opens the chat, and mirrors the answer to
Telegram when linked. The agent can also create and change tasks from chat. The
scheduler, limits and retry rules are in
[TELEGRAM_AND_SCHEDULES.md](./TELEGRAM_AND_SCHEDULES.md#scheduled-tasks).

## Chat history

In password mode (the self-hosted default) chats are stored in SQLite on the
persistent volume, not in the browser, so the desktop browser and the installed
app on a phone see the same conversations. The file defaults to
`chats.sqlite` next to the memory directory (the parent of `EVE_MEMORY_DIR`, so
`/app/.eve/.workflow-data/chats.sqlite` in the Docker image). `EVE_CHAT_DB_PATH`
overrides it. Both the web process and the eve process (for scheduled tasks)
use it; SQLite's write-ahead log keeps them consistent.

Chats saved in a browser by an older version are imported automatically on the
first visit after the upgrade, oldest first; each local copy is removed only
after the server confirms it. With `DATABASE_URL` set (the Vercel production
mode), chats are stored in Postgres instead.

## Checks

```sh
node scripts/test-chat-store.mjs                 # SQLite history: ownership, order, paging, delete
node scripts/test-telegram-and-schedules.mjs     # Tasks API and scheduler
node scripts/test-push-and-task-runner.mjs       # needs Node 24: notifications API, internal auth
```
