---
title: "Agent teams: decomposition and edit conflicts"
blurb:
  Decide when a team helps, assign file ownership and verify integration. Task claiming does not automatically
  lock source files against edits.
pubDate: 2026-04-23
order: 10
locale: en
updatedDate: 2026-09-08
---

Suppose one agent implements shared itinerary links while another builds the button. They can work independently after agreeing on the response format. If a backend waits for a schema and tests wait for the backend, three workers do not make that chain parallel.

The [agent teams documentation](https://code.claude.com/docs/en/agent-teams) describes coordinated sessions and experimental limitations. Check activation against your version. Claiming a task does not lock the corresponding source files against other participants. Assign file ownership explicitly.

## Divide a feature

For the teaching Travel Agent, consider shareable itineraries. Agree first on public fields, URL format and behavior after deletion.

| Work                   | Owner        | Dependency                   |
| ---------------------- | ------------ | ---------------------------- |
| Link storage schema    | Worker A     | Agreed contract              |
| Read endpoint          | Worker A     | Schema                       |
| Button and UI states   | Worker B     | Contract, initially fixtures |
| End-to-end integration | Main session | Both implementations         |

Two workers help only when there is enough independent work. Delegating one sentence of a PR description can cost more coordination than writing it.

## State boundaries

Assign files, expected outcomes, fixtures and a handoff procedure. Tell workers that other changes exist and must be preserved.

When two participants need the same file, choose one owner or sequence their changes. Keep shared-file edits sequential unless one participant owns the combined change.

## Verify integration

Assemble the changes in one working copy, inspect the combined diff and run the complete scenario. Individual passing tests do not prove that UI and backend agree on fields.

Test deleted itineraries, unavailable endpoints and expired links. Close unnecessary sessions and inspect remaining uncommitted work.

## Exercise

Complete a small task in one session. For a comparable team task, record setup, waiting, integration time and usage for every participant. Decide from those observations whether teams help your workflow.

Next: [models and cost](/en/courses/claude-code-guide/11-models-and-pricing/).
