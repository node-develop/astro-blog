---
title: "Daily workflow: task, diff and verification"
blurb:
  "A practical routine: define the outcome, inspect changes, preserve unfinished work and investigate recurring
  failures."
pubDate: 2026-04-23
order: 13
locale: en
updatedDate: 2026-09-07
---

A working routine should help finish tasks rather than require the same rituals every day. Establish the repository state and expected outcome first. Verify the changed behavior afterward.

## Before the task

Read git status, the current diff and project instructions. Do not automatically rebase or clean a directory containing unfinished work. Write down the user-visible change and its verification.

For trip dates, two conditions may suffice: reject an invalid range and preserve valid requests. “Make everything high quality” does not replace those conditions.

## During implementation

Review changes in manageable pieces. Investigate unexpected dependency or neighboring-module changes before the diff grows. After a test fails, connect the error to behavior instead of merely rerunning it.

Separate observed facts from assumptions. Do not paste the entire investigation into CLAUDE.md. Keep durable instructions there and task-specific details in the task report.

## Before completion

Inspect the full diff, run relevant checks, verify reported results, document unfinished steps and stage intended files. A contract change and a typo need different verification; the checklist is not a demand for identical tests every time.

## Weekly review

Choose tasks with many retries and identify their causes: incomplete requirements, incorrect instructions, unsuitable tools, implementation mistakes or missing checks. Change the process based on those causes rather than a universal model-selection percentage.

Use the [cost documentation](https://code.claude.com/docs/en/costs) and actual billing. `/cost` is not an invented report for all of yesterday’s sessions.

## Security boundaries

[Claude Code permissions](https://code.claude.com/docs/en/permissions) and environment access need separate configuration. Escaping text does not eliminate prompt injection. Keep external data distinct from instructions, constrain actions and avoid unnecessary production privileges.

Exercise: take a completed PR and connect requirement, change, verification and limitation. An unexplained transition identifies a process gap.

Next: [checking claims](/en/courses/claude-code-guide/14-claims-verification/).
