# Web app, notifications, tasks, memory, images and voice

The web app is Ægentica's main channel. It installs like a native app (a
Progressive Web App), keeps every conversation on the server, runs scheduled
tasks on its own, notifies the operator's devices when a result is ready, and
lets the operator see and edit what it remembers.

## Install the app

- **Android (Chrome)**: open the site, then **Settings → Notifications → Install**,
  or the browser menu's **Install app**.
- **iPhone and iPad (Safari)**: tap **Share → Add to Home Screen**. Notifications
  on iOS work only from the installed app (iOS 16.4 or later).
- **Desktop (Chrome, Edge)**: the install icon in the address bar, or
  **Settings → Notifications → Install**.

The installed app opens in its own window with shortcuts for **New chat**,
**Agents**, **Tasks** and **Settings** (long-press the icon on Android). The manifest is
`app/manifest.ts`; the icons, including a maskable one for Android's adaptive
shapes, are generated from the Æ monogram by `app/icons/[file]/route.tsx`.
Screenshots in `public/screenshots/` give Android and desktop Chrome the richer
install dialog. Opening the app again reuses its window instead of starting a
second one, and it follows the device's orientation.

Once installed on Android, Ægentica appears in the system **Share** sheet.
Shared text or a link opens a new chat with it already in the message box
(`app/_components/home-chat-page.tsx`); if the app is signed out, the draft
waits until sign-in. Shared photos, PDFs and text files (up to four) arrive as
attachments of that new chat, with the same size and type checks as the
attachment button. The service worker receives the share at `/share`;
`app/share/route.ts` only answers before the worker is running and keeps the
text.

On Android the page shrinks above the on-screen keyboard
(`interactive-widget=resizes-content`), so the message box stays visible while
typing.

`public/sw.js` is a deliberately small service worker. It shows notifications,
badges the app icon until the app is opened again, opens the right chat when a
notification is tapped, and serves a branded offline page
(`public/offline.html`) when a page cannot load. Navigation preload starts each
page request while the worker boots. It does not cache the app itself, so a
deploy is visible on the next load. It is registered in production
only (`app/_components/pwa-registration.tsx`).

## Notifications

**Settings → Notifications → Turn on** asks the browser for permission and
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

- **Create → Create with Ægentica** opens a new chat to describe the task in
  your own words; **Create → Set up manually** opens a form: a name, what
  Ægentica should do, and when: once, every day, every weekday, every week,
  or a custom cron expression. Times use the browser's time zone for new tasks.
- Search and the **All / Active / Paused / Completed** filters narrow the list.
- **Run now** runs a task within a minute without changing its schedule.
- **Edit**, **Pause/Resume** and **Delete** are in the row's menu.

Each run starts a normal agent session as the operator, saves it as a chat
titled after the task (so it appears in the sidebar on every device and can be
continued), sends a notification that opens the chat, and mirrors the answer to
Telegram when linked. The agent can also create and change tasks from chat. The
scheduler, limits and retry rules are in
[TELEGRAM_AND_SCHEDULES.md](./TELEGRAM_AND_SCHEDULES.md#scheduled-tasks).

## Images and voice

**Images.** The agent's `generate_image` tool (`agent/tools/generate_image.ts`)
creates pictures with the AI SDK's `generateImage` through the active provider
and its saved key, so no extra account is needed. The default model is
`openai/gpt-image-1-mini`, which both AI Gateway and OpenRouter offer;
`AEGENTICA_IMAGE_MODEL` overrides it. Images are saved on the volume
(`media/` beside `settings/`, `lib/media-store.ts`) and served only to the
signed-in operator from `/api/media/<name>`, so they reappear after a reload
and on other devices. The chat shows them under the tool line
(`components/chat/message.tsx`); the model only receives a short summary.

**Voice.** Voice uses the device's built-in speech features, so it costs
nothing and needs no provider:

- Dictation: the microphone in the message box uses the browser's speech
  recognition (Chrome and Android use Google's recogniser, Safari Apple's).
  Tap to start, tap again or send to stop. Browsers without it hide the button.
- Spoken replies: every finished reply has **Copy** and **Read aloud**.
  **Settings → Voice** sets the language, the voice (from the device's
  voices), the speed, and **Read replies aloud** to speak each new reply
  automatically.

Voice choices are per device, like a microphone choice, and live in the
browser's storage (`lib/voice/preferences.ts`); the speech helpers are in
`lib/voice/speech.ts`.

## Settings

Settings has five sections with a side menu (a contained, snap-scrolling row on phones):
**Models** (providers, keys and the default model), **Voice**, **Notifications**
(install and notifications for this device), **Connections**, and **Security**. Connections lists what Ægentica can use in the shape of a
plugin directory: built-in tools (web search, image creation, files and code,
voice, memory, tasks), accounts (GitHub and Telegram, set up in place) and work
apps through Vercel Connect (Linear, Notion, Sentry). **Browse directory** opens Capabilities → Explore with the official eve registry surface.

## Memory

The **Memory** page (`/memory`, in the sidebar) shows what Ægentica
remembers about the operator across the app, Telegram and scheduled tasks.
Entries can be added, edited and removed, and **Import** takes a pasted list
(one per line; bullets and numbering are stripped), for example ChatGPT's
Settings → Personalization → Manage memories.

The page edits the same document the agent uses. Memory is eve's built-in
`fileMemory()` provider in the `profile` slot (`agent/memory/profile.ts`),
stored in `profile.sqlite` inside `EVE_MEMORY_DIR` (`agent/lib/durable-memory.ts`).
The agent saves with `profile__save_memory` when asked to remember something
and removes with `profile__remove_memory`. `lib/memory-store.ts` reads and
writes that document in the provider's own versioned format and with its
limits: 8,000 characters of recalled memory, about 2,000 per entry, duplicates
skipped. Each edit bumps the document version, so a concurrent agent save
retries rather than overwriting it.

eve derives each document's storage key from the memory scope and does not
expose it, so the agent records which key belongs to the operator on its first
recall (`memory_owner` table). Until the operator has sent one message, the
page says memory starts with the first message. Memory is off, and the page
says so, when `EVE_MEMORY_DIR` is not set.

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
node scripts/test-memory-store.mjs               # needs Node 24: Memory page and eve fileMemory share one document
node scripts/test-image-generation.mjs           # needs Node 24: generate_image, media storage and route
```

## Main composer and workspace navigation

The main persisted chat now has the same attachment path as eve's official client: structured AI SDK file content sent through `useEveAgent`, not a separate upload server. Attach or paste PNG/JPEG/WebP/GIF images, PDF or text: at most four files and 6 MB total per turn. Files persist in this device's IndexedDB through draft, provisional chat and canonical chat navigation, then clear after an accepted send. Unsent files are device-local, not synchronized to other devices. Disabling site storage prevents this draft workflow; errors are shown rather than pretending files were sent. Sign-out clears local composer drafts. Image input requires a catalog model marked Vision; changing to an incompatible model yields a recovery error. Model support for documents can still vary by provider.

Choose Chat, Research or Image beside the agent selector without changing conversation. Research and Image supply turn instructions; they are not new runtimes or fake modality endpoints. Image uses the existing `generate_image` tool. Voice retains the device dictation/read-aloud/hands-free loop, not native real-time audio/video.

While a durable turn is submitted or streaming, the primary composer remains available for a correction. Sending that correction uses eve's documented `turnPolicy: "steer"`, so it stays in the same turn; Stop still calls eve's durable `cancel()`. Normal input remains blocked while resuming, finalizing or waiting on authorization/HITL. This matches the capability already exposed by the advanced Live session instead of hiding it there.

`/agents` creates saved profiles and `/images` lists generated images, with authenticated details, prompt/model metadata when present, save and confirmed deletion. Older images without metadata remain readable. The gallery scans at most 3,000 directory entries / 1,000 image files and pages 48 at a time; the limit is disclosed. Media responses are private and `no-store`, including after sign-out. Deleting an image also removes it from chats referencing that file.

The sidebar uses shared navigation metadata. Global Search (Cmd/Ctrl+K) includes pages, actions, settings and up to 100 recent conversations. The advanced AI Elements Live session remains searchable without becoming a second primary chat. Mobile navigation uses the existing Radix Dialog for focus management and Escape handling, with an isolated touch-swipe adapter: swipe right anywhere to open (Android reserves the screen edge for Back) and swipe left on the drawer to close; the drawer slides in from the left. It has one internal scroll owner, closes on navigation, and closes when resized to desktop. See [Agents and orchestration](./AGENTS_AND_ORCHESTRATION.md).
