# Production release (aegentica.se)

Hosts: aegentica.se (primary), www.aegentica.se and ai-chat.se, one Dokploy application `YZiCsMtzVXR5vLrO8AgWM`
that runs the image `localhost:5000/aegentica-app:latest`, built from the private
`Caceras/aegentica-app` `main` by the Dokploy compose builder `aegentica-git`
(`Z2eLRXasnZN_JwCW6VpsN`, its own read-only deploy key). Auto-deploy is off. One container runs Next.js on port 3000 and the eve runtime on
127.0.0.1:4274 under `scripts/start-self-hosted.mjs`. The persistent volume
`eve-chat-data` is mounted at `/app/.eve/.workflow-data`.

## What lives on the volume

- `chats.sqlite`: chat history (`EVE_CHAT_DB_PATH` overrides)
- `profile.sqlite` inside `EVE_MEMORY_DIR`: long-term memory
- `settings/*.enc`: provider keys, GitHub and Telegram tokens, push keys and
  devices, scheduled tasks and saved agents (`settings/agents.enc.json`),
  encrypted with a key derived from `EVE_SESSION_SECRET`; beside them the
  password verifier and the signed-out session list
  ([SECURITY_AND_ACCESS.md](./SECURITY_AND_ACCESS.md))
- generated images and their metadata
- eve's workflow data for durable sessions
- `sandbox-sessions/`: each chat's bash sandbox files (the agent's
  `/workspace`, attachments it saved). The image links eve's
  `.eve/sandbox-cache/just-bash/sessions` here so they survive a new
  container. Nothing prunes this directory; a session whose files are missing
  starts again from a fresh workspace.
- `backups/<YYYY-MM-DD>/`: the nightly copies of the chat and memory
  databases and `settings/`, the last seven nights (see
  [Backups and restore](#backups-and-restore))

Everything on the volume belongs to the `node` user (uid 1000) and is
owner-only; the start script re-owns an older volume on start
([SELF_HOSTING.md](./SELF_HOSTING.md#user-and-file-ownership)).

Never replace the volume with an empty one, and keep `EVE_SESSION_SECRET`
with it: a new secret makes the saved settings unreadable.

## Access

Operator login is set with `EVE_CHAT_USERNAME` and `EVE_CHAT_PASSWORD`; change
the initial password. It is a single operator account, not a multi-user
service. The login limiter counts failed attempts per client address (an IPv6
client per /64) and all attempts in total per process, which suits the single
replica; a browser that signed in before (signed known-device cookie) is outside
the overall cap.

## Model access

Choose Vercel AI Gateway or OpenRouter in Settings; keys are saved encrypted
on the volume (`AI_GATEWAY_API_KEY` and `OPENROUTER_API_KEY` are fallbacks).
Set a spending limit on each key; each session also stops at $25 of model
cost. Keep a second provider's key saved: if one provider rejects its key,
switching is one click. See [SELF_HOSTING.md](./SELF_HOSTING.md).

## Deploy and verify

Build: `pnpm install --frozen-lockfile`, `pnpm build:eve`, `pnpm build`
(Node 24); the image then drops `.next/cache` and prunes dev dependencies
(`prune --prod` in the `Dockerfile`). A dev dependency that a production package names as an
optional peer stays, because pnpm keeps the resolved peer: `drizzle-kit` with
its esbuild (for `better-auth`) and the `@types/*` packages remain, unused at
runtime. For the same reason the app has no `microsandbox` dev dependency (eve's
optional sandbox peer, a 74 MB binary): the sandbox is pinned to just-bash in
`agent/sandbox/sandbox.ts`. Release only a merged revision whose product check passed:

1. Deploy the Dokploy compose `aegentica-git` (`Z2eLRXasnZN_JwCW6VpsN`). Its
   `builder` log ends with `PUSHED localhost:5000/aegentica-app:<short sha>`
   for the merged commit, a few minutes later.
2. Deploy the application `YZiCsMtzVXR5vLrO8AgWM`; it pulls `:latest` in
   seconds. Keep `eve-chat-data` and every environment value, including
   `EVE_SESSION_SECRET`.
3. `/api/health` on aegentica.se, www.aegentica.se and ai-chat.se returns 200
   with `ok`, `app`, `eve` and `database` ready, `storage` `database` and a
   `release` matching `RELEASE` in `lib/release.ts`.
4. Logged out, `/api/chats`, `/api/agents`, `/api/images` and every
   `/api/settings/*` route return 401, `/api/bootstrap` reports only
   `appReady`, `authMode` and `authReady`, and a POST to
   `/.well-known/workflow/v1/flow` (eve's internal workflow queue) returns 404.
5. `/`, `/sw.js`, `/manifest.webmanifest` and `/icons/icon-192.png` load.
   `pnpm verify:live` checks steps 3 to 5 on all three hosts (`LIVE_ORIGINS`
   narrows them). The **Verify live** workflow
   (`.github/workflows/verify-live.yml`) runs the same script from GitHub:
   dispatch it on `main` from the repository's Actions tab or through the
   GitHub API (`POST /repos/Caceras/aegentica-app/actions/workflows/verify-live.yml/dispatches`
   with `{"ref":"main"}`, optionally `"inputs":{"origins":"…"}`).
6. Signed in: the active provider's **Test connection** succeeds, a chat
   streams a reply and reappears in the sidebar after a reload, and the Memory
   and Tasks pages load.
7. Read the runtime logs. Remove any temporary QA container and its own volume;
   never the production volume.

A release that changes eve's version ends every eve session that was open: the
self-hosted workflow store replays a session with the running eve, and a session
started on another eve version cannot be replayed. The first logs then show
`Replay divergence … eve@<old> … eve@<new>` for each such session, which is
expected. Web chats and Telegram continue in a new session with their next
message (a chat marks where it started over); saved chats, memory and settings
stay, but the agent no longer remembers those conversations' earlier turns, and
approvals left waiting before the deploy are gone. A rollback across an eve
version does the same in reverse.

## Rollback

Point the application at the previous `localhost:5000/aegentica-app:<short sha>` image and redeploy. Code changes never migrate data
destructively: the SQLite files add tables and columns only. To go back to an
earlier state of the data itself, restore a nightly backup (below).

## Backups and restore

Every night at 03:17 in the task time zone (`AEGENTICA_TIMEZONE`, Europe/Stockholm
by default) the eve schedule `agent/schedules/nightly-backup.ts` copies the
state that exists only on the volume into `backups/<YYYY-MM-DD>/` in the
volume's root (`/app/.eve/.workflow-data/backups/` in the container):

- `chats.sqlite` and `profile.sqlite`: consistent snapshots of the chat and
  memory databases, taken with SQLite's online backup while the app runs, as
  standalone files without `-wal` or `-shm`. Chats are skipped when
  `DATABASE_URL` keeps them in Postgres.
- `settings/`: the encrypted settings files and the password record.

Folders are `0700` and files `0600`. The last seven nights are kept. A night
that could not copy everything logs `[nightly-backup] incomplete` and keeps
every older night; a night the container was down is caught up at the next
hourly check. Generated images (`media/`) and eve's workflow data (the durable
state of sessions and runs) are not part of the nightly copy.

These copies protect against a corrupted database, a bad release and mistakes.
They share the disk with the originals, so they do not survive losing the
volume or the VPS: copy them off the server regularly. On the VPS host (the
application can keep running):

```sh
docker run --rm -v eve-chat-data:/data:ro -v /root/aegentica-backups:/out debian:bookworm-slim \
  tar czf /out/eve-$(date +%F).tgz -C /data backups settings media
```

Then move `/root/aegentica-backups/*.tgz` to another machine. The databases
in the archive are not encrypted (they hold every chat and memory), so keep
the archive private. Keep `EVE_SESSION_SECRET` somewhere safe as well, but not
next to the archive: without it the settings copies cannot be decrypted, and
the saved keys and tokens have to be entered again.

To restore a night:

1. Stop the application in Dokploy; the volume stays.
2. Put the night's databases in place and delete the stale write-ahead files
   of the ones they replace (`profile-memory` stands for the directory
   `EVE_MEMORY_DIR` names):

   ```sh
   docker run --rm -v eve-chat-data:/data debian:bookworm-slim sh -c '
     day=2026-09-26
     cp /data/backups/$day/chats.sqlite /data/chats.sqlite
     cp /data/backups/$day/profile.sqlite /data/profile-memory/profile.sqlite
     rm -f /data/chats.sqlite-wal /data/chats.sqlite-shm \
       /data/profile-memory/profile.sqlite-wal /data/profile-memory/profile.sqlite-shm'
   ```

   Copy files from `backups/<day>/settings/` back into `settings/` only for
   settings that were lost or damaged. From an off-server archive, extract it
   into the volume first the same way.

3. Start the application, check `/api/health`, sign in and open a restored
   chat and the Memory page.

## Data retention and disk use

Deleting a chat removes it from `chats.sqlite` (and, after seven nights, from
the backups), but not from eve's workflow data: the `events/` and `runs/`
directories on the volume keep the text, tool calls and attachments of every
session, including those of deleted chats. The app cannot remove them yet, so
treat the volume and every copy of it as holding all past conversations.

Apart from the backups, nothing on the volume is pruned. `chats.sqlite` grows with every
turn and stores attachments inline as base64 (a 3 MB photo adds about 4 MB),
`media/` grows with every generated image, the workflow data with every session
and step, and sandbox sessions with the agent's files; the nightly backups add
up to seven copies of the databases. Watch the server's disk usage in
Dokploy's monitoring and the volume's size (`docker system df -v` on the host);
a full disk shows up in the logs as "database or disk is full".

## Release history

- `orchestration-2026-09-23`: saved agent profiles, eve-native delegation, main-chat attachments, private image library, global search, capability directory.
- `polish-2026-09-24`: eve 0.66.2, file sharing from the Android share sheet, app icon badges, keyboard-aware layout, conversation picker on Activity.
- `polish-2026-09-24b`: errors keep the phone top bar usable and link to Settings, one search control per layout, readable capability rows, compact Activity toolbar.
- `maintenance-2026-09-24`: eve 0.66.3 and better-auth 1.7.5 patch releases.
- `maintenance-2026-09-25`: no false Better Auth schema error in password mode, about 310 MB smaller image, chat saves per turn no longer grow with reply length; the app moved to its own repository, `Caceras/aegentica-app`.
- `polish-2026-09-25`: phone tab and filter rows (Settings, Capabilities, Tasks) share one edge-to-edge scroll style that fades at the edges to show more options; the visual tour now also captures a conversation and the phone menu.
- `polish-2026-09-25b`: branded Not found pages for unknown addresses and deleted chats, readable capability details (lists and code instead of raw text), a top bar that fades over scrolled content on phones, and finger-sized menu, select and search rows.
- `polish-2026-09-25c`: a phone navigation drawer that follows the thumb (swipe to open anywhere, swipe or tap outside to close, its list scrolls), the back gesture closes drawer and search, no pull-to-refresh or keyboard popping up by itself, menus open on tap, a refresh keeps the model name and voice buttons steady, a calmer home screen with the composer under the thumb, pinned tab rows with the top bar's mist, branded install images, and a reload right after a reply no longer sends the message again.
- `polish-2026-09-25d`: ready for Chrome drawing the installed app under the status and gesture bars (`web-app-short-edges-cutout-mode`): content starts below the status bar and pinned rows stay under the top bar, so the black strip under Android's gesture bar becomes the app's own background.
- `polish-2026-09-25e`: the app shell is pinned to the screen's edges instead of `100dvh`, which in Chrome's edge-to-edge installed-app mode came out taller than the screen and let the home page scroll (top bar under the status bar, composer cut off).
- `skills-2026-09-25`: the composer and Tasks list every skill the runtime reports (sol0's research, PR review, failing-check and image skills plus the daily briefing) instead of fixed Chat/Research/Image modes; tasks can follow a skill; saved-agent delegation runs in a copy of Ægentica that keeps every skill, tool and connection (the skill-less researcher is gone); the invisible weekly heartbeat run is removed.
- `polish-2026-09-26`: chats can be renamed from their sidebar menu (kept on every device, history order unchanged); a hard load in a time zone other than the server's no longer makes React rebuild the sidebar; the composer shows the model at once when a chat starts or a page opens instead of "Loading models…"; new tasks start at the next 08:00; each page has its own browser title (for example "Tasks · Ægentica").
- `polish-2026-09-26b`: the installed app loses more website tells: Android's back gesture closes any open dialog, menu or picker before leaving the page; a long press on a chat opens its Rename/Delete menu (no Chrome link menu in the app); home-screen shortcuts get their own icons and a themed-icon silhouette; on the desktop, files open with Ægentica or dropped onto the window attach to a chat, and Ctrl/⌘+Shift+O / Ctrl/⌘+B start a chat and toggle the sidebar; an Offline status, the screen stays on during a voice conversation, and installed-app storage is kept.
- `polish-2026-09-26c`: the installed app syncs itself: the chat list catches up when the app returns, when the connection returns and when a task result arrives (the service worker tells open windows), so another device's chats appear without a restart; the offline page continues on its own once back online; phones share replies and chat links through the share sheet, with finger-sized reply actions; the Images page no longer points to the removed Image mode; Capabilities shows readable names (Read file) with the identifier in the details; a half-written message keeps its text per chat through the app being closed or reloaded, until sent.
- `polish-2026-09-26d`: pictures in a chat and on the Images page open in a full-screen viewer (pinch to zoom, Save, Share the picture itself on phones) instead of a raw file in a browser tab; Ctrl/⌘+, opens Settings, Escape stops a streaming reply, and Search lists the keyboard shortcuts; Android's back gesture no longer counts as an unhandled Escape once it has closed a menu.
- `polish-2026-09-26e`: real third-party logos, monochrome and theme-aware: model makers in the model picker, the composer's model button and agent settings; AI Gateway and OpenRouter; GitHub, Telegram, Linear, Notion and Sentry; registry channels and services in Capabilities; tool calls of connected services. Catalog makers read as names (Arcee AI, IBM, xAI for Grok) instead of slugs.

- `security-2026-09-26`: closes an unauthenticated path to the agent: the app no longer proxies eve's internal workflow queue (`/.well-known/workflow/*`, which accepts runs without sign-in), and the eve runtime now listens on 127.0.0.1 only instead of every container interface; removing the last memory on the Memory page no longer breaks every reply (an emptied memory is saved in eve's own format, and one emptied by an earlier release is repaired when read).
- `audit-2026-09-26`: a full audit's fixes. Chat: Back to a chat no longer sends its first message again or cuts later turns, leaving while a reply streams resumes it on return, a reload mid-reply no longer saves the reply twice, chats with photos over ~0.7 MB save again, long chats stream without freezing, and saves upload only the new turn. Tasks: Run now leaves the schedule alone, runs report failed (with the reason) or waiting instead of "finished", timed-out runs are stopped instead of repeated. Readable provider errors everywhere ("OpenRouter is out of credits…"), an honest Test connection, confirmations before destructive actions, truthful Capabilities and Connections, Linear/Notion/Sentry and demo tools only when real, saved-agent fixes, security headers, a per-client sign-in limit, a race-free settings lock, bounded task storage, the real site URL in link previews, and CI that builds and boots the image.
- `polish-2026-09-26f`: the audit's remaining front-end fixes. Long shares from other apps arrive whole instead of failing; Enter while composing in an input method (Japanese, Chinese, Korean) no longer sends; long messages are kept and show the length limit instead of being cut silently; shortcuts use ⌘ on Apple devices and Ctrl elsewhere, so Ctrl+B and Ctrl+K stay text-editing keys on a Mac; text messages send even when the browser blocks site storage; a chat that could not start says why; a failed Stop says so; the offline page shows its mark and a notification tap focuses the open app; a readable message box placeholder; disabled and replaced capabilities are labelled; memory import reports what it added and skipped; finger-sized controls in the saved-agent, Tasks, Voice and Activity dialogs.
- `audit2-2026-09-26`: the second full audit and eve 0.67.0; conversations started before it continue in a new eve session (see Deploy and verify). Approving a tool call now runs it (a per-turn note used to drop it). Security: sign-out revokes the session on the server and Sign out everywhere is new, the sign-in limiter cannot lock the operator out, unsigned webhook calls stop at the app, eve refuses cross-site writes, images from other sites in replies become links, the container runs as `node` with owner-only files and the sandbox cannot reach private addresses. Chat: an open chat follows its session (no double sends or repeated replies), a chat whose session ended continues in a new one, steering and Stop work for every reply, errors read plainly, sent files show in their message. Tasks: DST, Run now and truthful reports; new tasks are confirmed by the operator. Operations: nightly on-volume backups, health 503 when chats cannot be served, apps recover by themselves after a deploy. Plus accessibility (pointer-based sizing, skip link, focus, contrast) and lighter pages (math, diagrams, the model list and Search load on demand).
- `audit2-2026-09-26b`: **Skip to content** no longer peeks out at the top left of the installed app on phones whose status bar is taller than its hiding distance, and shows for keyboard focus only.
- `voice-2026-09-26`: replies read aloud with an OpenRouter voice (Settings → Voice lists OpenRouter's text-to-speech models and their voices with a preview; Gemini 3.8 Flash TTS by default once a key is saved; the device voice stays free and takes over if the voice cannot be reached), also in a voice conversation. The message box loses its agent and skill menus: `/` lists skills and `@` saved agents inline, picks show as chips, and attach moves to the footer. The home page drops the suggestion chips and keeps the greeting and box in the upper part of the page, and the first message turns it into the chat in one motion instead of a flash. Replies stream at a steady pace with words fading in, reasoning shows its newest lines while thinking and folds to "Thought for 12s" that a tap opens, and "Thinking…" no longer sits under a reply that is already streaming.

Entries describe code scope. [RELEASE_VERIFICATION](./RELEASE_VERIFICATION.md) holds the checks and domain gates.
