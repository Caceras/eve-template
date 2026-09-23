# GitHub

Ægentica works with GitHub through the official
[`@github-tools/eve-extension`](https://github-tools.com/frameworks/eve-extension),
the extension listed in eve's registry as `extension/github-tools`. It is
mounted in `agent/extensions/github.ts`, so its tools reach the model as
`github__<tool>` (for example `github__getPullRequestContext`).

## Connect

1. In **Settings → GitHub**, follow **Create a GitHub token**. The link opens
   GitHub's fine-grained token form with the permissions filled in: Contents,
   Pull requests, Issues and Actions (read and write) plus Metadata (read).
   Choose which repositories the token may use and an expiry.
2. Paste the token and press **Connect GitHub**. Ægentica checks it against
   `GET /user`, shows the account it belongs to, and stores it AES-256-GCM
   encrypted in `settings/github.enc`. It is never shown again or sent to the
   browser.

`GITHUB_TOKEN` in the server environment is the fallback when no token is
saved. **Disconnect** removes the saved token. The token is read on every tool
call, so connecting or disconnecting takes effect on the next message without
a restart. Classic tokens (`ghp_…`) also work.

## What the agent can do

The mount includes a curated set rather than the full 84-tool catalog, to keep
every turn's context small:

- Read: repository, tree and file content, branches, code, repository and
  issue search, commits and comparisons, pull requests with files, reviews and
  checks, issues with comments, workflow runs, CI failure context, and
  notifications.
- Change: create issues and comments, comment on and review pull requests,
  create branches, create or update files, open and merge pull requests, and
  re-run workflows.

Every tool that changes GitHub uses the extension's default `always()`
approval: the chat shows an approval card and nothing happens until the user
approves it. To add a tool, add its name to `include` in
`agent/extensions/github.ts` (names are listed in the extension README).

Without a token the tools stay listed, and a call returns "GitHub is not
connected", which the agent turns into a pointer to Settings.

## Skills that use it

- `review-a-pull-request`: reads the PR, the surrounding code and CI, and
  reports findings in order of severity.
- `investigate-a-failing-check`: finds the first real error in a failing run
  and separates defects, broken environments and flakes.
- `daily-briefing`: adds review requests, assigned issues and notifications
  when GitHub is connected.

## Checks

```sh
node scripts/test-github-settings.mjs
```

covers operator-only access, same-origin writes, token format and
verification, encrypted storage, that the token is never echoed, the per-call
token with environment fallback, and disconnect.
