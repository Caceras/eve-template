---
description: Use when a CI check, build, workflow or GitHub Action is failing and someone wants to know why, including "why is CI red", "the build broke" or "what failed on main".
---

# Working out why a check failed

## Find the actual failure, not the summary

1. `github__listWorkflowRuns`, filtered to the branch or commit in question. A run's conclusion tells you that it failed, not why.
2. `github__getCiFailureContext` for the failing run or pull request: the failing jobs and their log excerpts.
3. Read the log. The last line is usually the exit code, not the cause; the cause is often much earlier, and everything after it is fallout. Look for the first error, not the last.

## Establish whether it is this change's fault

Before telling anyone their change broke the build, check whether the same job fails on the base branch with `github__listWorkflowRuns`. A pre-existing failure blamed on a PR costs someone an afternoon looking for a bug they did not write.

## Separate the three kinds of red

- A real defect: the code is wrong. Name the file and line and the input that makes it fail.
- A broken environment: missing secret, expired token, quota, a moved runner image. The code is fine; the fix is a setting, not a commit.
- A flake: it passes on re-run. Say so explicitly. A test that fails one time in ten is a defect in the test. `github__rerunWorkflowRun` asks the user first.

Do not guess between these. If the log does not say, report what it does say.

## Reporting

Quote the failing lines; a person who sees the error can often recognise it instantly. If the fix is obvious and small and you were asked to fix it, propose the change. If it is not obvious, "the log says X, and I cannot tell from here whether that is the environment or the code" beats a confident wrong answer.
