---
title: "Daily workflow: task, diff and verification"
blurb:
  "A practical routine: define the outcome, inspect changes, preserve unfinished work and investigate recurring
  failures."
pubDate: 2026-04-23
order: 13
locale: en
updatedDate: 2026-09-08
---

A working routine should help finish tasks rather than require the same rituals every day. Establish the repository state and expected outcome first. Verify the changed behavior afterward.

## Before the task

Start with `git status --short` and `git diff`, then read project instructions. The latter shows unstaged changes to tracked files, not new untracked files; use the status output to find those. Use `git diff --cached` for staged changes. Do not automatically rebase or clean a directory containing unfinished work. Write down the user-visible change and its verification.

For trip dates, two conditions may suffice: reject an invalid range and preserve valid requests. “Make everything high quality” does not replace those conditions.

## During implementation

Review changes in manageable pieces. Investigate unexpected dependency or neighboring-module changes before the diff grows. After a test fails, connect the error to behavior instead of merely rerunning it.

Separate observed facts from assumptions. Do not paste the entire investigation into CLAUDE.md. Keep durable instructions there and task-specific details in the task report.

## Before completion

Inspect the full diff, run relevant checks, verify reported results, document unfinished steps and stage intended files. A contract change and a typo need different verification; the checklist is not a demand for identical tests every time.

## Weekly review

Choose tasks with many retries and identify their causes: incomplete requirements, incorrect instructions, unsuitable tools, implementation mistakes or missing checks. Change the process based on those causes rather than a universal model-selection percentage.

Record unfinished decisions and the next step before starting a new conversation. Keep task-specific findings in the task report, rather than copying the entire investigation into permanent project instructions.

## Security boundaries

[Claude Code permissions](https://code.claude.com/docs/en/permissions) and environment access need separate configuration. External files or pages can contain instructions that try to redirect the agent. This is prompt injection; escaping text alone does not eliminate it. Keep external data distinct from instructions, constrain actions and avoid unnecessary production privileges.

Exercise: take a completed PR and connect requirement, change, verification and limitation. An unexplained transition identifies a process gap.

Next: [checking claims](/en/courses/claude-code-guide/14-claims-verification/).
