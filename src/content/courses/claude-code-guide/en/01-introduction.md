---
title: "Claude Code: model, tools and execution environment"
blurb:
  Separate the model from tools and execution, then verify a small task. The course uses Travel Agent as a
  teaching design, not a production-ready service.
pubDate: 2026-04-23
order: 1
locale: en
updatedDate: 2026-09-07
---

Separate Claude Code into three parts: the model proposes actions, tools read and change the environment, and the application manages execution. A model name alone does not describe that workflow. The [Claude Code architecture guide](https://code.claude.com/docs/en/how-claude-code-works) explains this distinction.

## Locate the failure

An agent fixing trip-date validation might misunderstand the requirement, read the wrong file, encounter a denied tool call, or edit code without testing it. All look like “the task failed,” but each needs a different correction.

```mermaid
flowchart LR
  R[Requirement] --> M[Model decision]
  M --> T[Tool call]
  T --> E[Execution result]
  E --> M
  M --> V[Verification]
```

Preserve significant actions alongside the answer: files read, changes made, checks run and their results. Do not copy a complete log containing secrets into the report.

## The course example

Travel Agent is a teaching design for a trip-planning service. It starts with prepared itinerary fixtures. Provider search, bookings and payments require separate implementations. This course does not provide a published production repository for that service; package names describe a proposed layout.

The example lets us discuss a concrete task without placing real orders. A user supplies cities, dates and a budget; the service returns options and explains constraints. Missing information should remain explicit rather than becoming an invented price or seat availability.

## First exercise

Choose a small repository you know. Record `claude --version`, the starting commit and verification commands from its README. Ask the agent to locate one feature’s handler, explain its inputs and propose a check without changing files.

Compare the answer with the source. It should cite real paths, distinguish observations from assumptions and avoid claiming unexecuted tests. Investigate invented references before expanding the task.

Then request a small change with an acceptance criterion: invalid date ranges are rejected while an existing valid request still succeeds. Review the diff and run the check yourself.

## Define the outcome

Code generation is an intermediate step. The outcome is verified behavior with a clear boundary: what was checked, against which data, and what remains outside the task. Context size and a more expensive model cannot replace this evidence.

Next: [context and caching](/en/courses/claude-code-guide/02-context-and-cache/).
