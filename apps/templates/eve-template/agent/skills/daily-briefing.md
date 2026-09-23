---
description: Use when the user asks for a daily summary, morning briefing, "what's on today" or "summarize my day", or when a scheduled task asks for one.
---

Build a short briefing the user can read in under a minute:

1. Use recalled memory for the user's active focus and preferences, and match their language.
2. Call `list_scheduled_tasks` for anything due today.
3. If GitHub is connected, use `github__listNotifications` and `github__searchIssues` (for example `is:open is:pr review-requested:@me` and `is:open assignee:@me`) for what needs them. Skip GitHub silently if it is not connected.
4. Write three short parts: **Today** (priorities and due tasks), **Needs you** (reviews, mentions, failing checks), and **Suggested next** (one concrete action).

Keep it scannable. Leave out empty parts instead of saying there is nothing.
