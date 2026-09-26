# Vision and status

Ægentica is the new sol0. sol0 (sol0.ai, `Caceras/sol0`) set the vision: a
calm, private AI environment that escalates from a simple answer to durable,
verified work across models, tools, connected services and devices, with every
action that matters going through one approval gate. sol0 is retired; its
hosting is off and its data remains in its Neon project.

sol0's own July 2026 rebuild audit found that it had hand-built most of the
platform its framework already provided, and that those rebuilds were where
its bugs lived. Ægentica takes the opposite route: eve supplies the platform
(durable sessions, approvals, memory, schedules, subagents, sandbox, channels,
extensions), and Ægentica adds only product UI and glue.

## Status against the sol0 vision

Last reviewed: 26 September 2026.

| Pillar                                                          | sol0 reached                          | Ægentica today                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Work survives a closed tab or a device switch (sol0 "Stage 1")  | Never reached                         | Built into eve's durable sessions                                                                                                   |
| One safe way to act: every consequential action behind approval | Partial                               | Tool-specific eve approvals (`write_file`, GitHub writes, profile creation); no per-profile permission grants                       |
| Chat, model choice, AI Gateway and OpenRouter                   | Yes                                   | Yes, with instant provider switching                                                                                                |
| Same conversations on every device                              | Yes                                   | Yes (SQLite on the server volume)                                                                                                   |
| Scheduled tasks with phone notifications                        | Phone delivery never confirmed        | Tasks page, runs saved as chats, Web Push, Telegram mirror                                                                          |
| Tools: sandbox, files, web search and fetch                     | Yes                                   | Built into eve                                                                                                                      |
| Skills                                                          | 7                                     | eve skills, including sol0's research, PR review, failing-check and image skills, plus a daily briefing; pickable in chat and Tasks |
| Memory                                                          | Its own audit: "probably not running" | eve file memory with a Memory page to view, edit and import                                                                         |
| Subagents                                                       | Experimental                          | Root-agent copies with every skill and connection, a reviewer, saved profiles and background delegation; no runtime provisioning    |
| GitHub                                                          | Built, not confirmed                  | Official github-tools extension, token in Settings, writes need approval                                                            |
| Gmail, Calendar, Drive                                          | Built, not confirmed                  | Not yet                                                                                                                             |
| Delegating coding to Claude Code or Codex                       | Turned off                            | Not yet                                                                                                                             |
| Image generation, spoken replies, widgets                       | Yes                                   | Images through the active provider with a private gallery; main-chat attachments; device dictation/read-aloud; no widgets           |
| Live voice conversation                                         | Never confirmed end to end            | Dictation, read-aloud and a hands-free talk-and-listen loop; no real-time voice room                                                |
| Mac desktop app, local file tools, Chrome extension             | Unsigned, not confirmed               | Not planned yet; the PWA covers desktop and phone                                                                                   |
| Stewards: goals kept on track with checked outcomes             | Never reached                         | Not yet; Tasks is the base                                                                                                          |
| Hosting                                                         | Vercel (disabled)                     | Own server: HostUp VPS with Dokploy; nightly on-volume backups, copied off the server by hand                                       |

## Next, in order

1. **Google**: Gmail, Calendar and Drive through eve connections, reads free,
   sends and edits behind approval. This makes sol0's `catch-up-on-email` and
   `plan-around-my-calendar` skills portable.
2. **Real-time voice**: the hands-free loop exists; add provider real-time
   voice when device speech is not enough.
3. **Delegation**: hand coding work to Claude Code or Codex behind approval,
   ending in a pull request (sol0's "short term" horizon).
4. **Stewards**: tasks that pursue a goal, act within approval, and prove the
   outcome from external evidence (sol0's final acceptance test).
5. **Widgets**: small interactive results in chat where they read better
   than text.

## Principles carried over from sol0

- Simple work stays simple: no planning or delegation for ordinary turns.
- Knowledge does not grant authority: skills and memory never widen permissions.
- Models are replaceable: identity, memory and work live above any provider.
- Consequential effects ask first; completion is proven by evidence, not by the
  model saying so.
- Chat is home, not a prison: pages such as Tasks and Memory exist where they
  serve better than a message stream.

## Product release boundary

Saved profiles, skill selection in the composer, attachments, image management and global search are implemented without a second runtime. This is still one private operator workspace. Arbitrary code installation, separate agent identities, per-agent capability grants, native real-time audio/video, public multi-tenancy and fully autonomous software-factory deployments remain outside this release. See [AGENTS_AND_ORCHESTRATION](./AGENTS_AND_ORCHESTRATION.md) and [RELEASE_VERIFICATION](./RELEASE_VERIFICATION.md); do not mark these broader goals complete based on UI alone.
