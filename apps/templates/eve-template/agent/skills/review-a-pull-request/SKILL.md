---
description: Use when asked to review a pull request, look at a PR, check whether a change is safe to merge, or explain what a diff does. Covers reading the diff, checking CI, and reporting findings worth someone's attention.
---

# Reviewing a pull request

Ægentica can read GitHub directly. Use the `github__*` tools rather than asking the user to paste anything.

## Get the shape before the detail

1. `github__getPullRequestContext`: title, body, state, base and head, changed files, reviews and checks in one call. Read the description; a PR that explains itself is reviewed against its own claims.
2. `github__listPullRequestFiles` when you need the patches. Look at how much changed before opening any file; a 40-file PR and a 2-file PR are different jobs.
3. Read the existing reviews in the context. Repeating a point someone already made, or one the author already answered, wastes their time.

## Read the diff, then read around it

Patches are enough for small changes and misleading for large ones, because a diff hides what it was cut out of. When a change touches logic you cannot evaluate from the patch alone, open the whole file with `github__getFileContent` at the PR's head ref. Two things are only visible with the surrounding code: whether a new branch duplicates one that already exists a few lines up, and whether a caller relies on behaviour the change quietly alters.

Use `github__searchCode` to find callers of anything whose signature or meaning changed. A function's diff can be perfect and still break every place that uses it.

## Check whether it actually runs

Use `github__getCiFailureContext` for a red check. Read the failing log lines before reporting: "CI is failing" is not useful; "the type check fails on `src/x.ts:40` because the new option is not on the type" is. A failure that also fails on the base branch (check `github__listWorkflowRuns` for the base) is not this PR's fault; say so.

## What to report

Lead with anything that would break in production, lose data or expose something. Then correctness. Then everything else, briefly. Say what breaks and how, not what you would have preferred. If the change is fine, say that plainly and stop; manufactured findings train people to ignore reviews.

Do not approve or merge unless the user explicitly asks. Posting a review or comment (`github__createPullRequestReview`, `github__addPullRequestComment`) asks the user for approval first; only offer it after sharing the findings.

## What you cannot see

You are reading the repository, not running it. When a change's risk lives in runtime behaviour, a migration against real data, or how a UI looks, say so rather than implying the diff was enough.
