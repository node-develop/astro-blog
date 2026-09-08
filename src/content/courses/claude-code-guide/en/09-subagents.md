---
title: "Subagents: task, context and filesystem boundaries"
blurb:
  Define a small contract-reading agent, assess its result and distinguish separate context from filesystem
  isolation.
pubDate: 2026-04-23
order: 9
locale: en
updatedDate: 2026-09-08
---

While the main agent edits date validation, a helper can locate relevant tests and return a concise finding. Such a subagent fits a bounded task: locate handlers, inspect a contract or investigate a failing test. If it needs the whole conversation and constant clarification, delegation may cost more than direct work.

## Minimal definition

Create `.claude/agents/contract-reader.md`:

```markdown
---
name: contract-reader
description: Locates the input schema, handler and tests for a requested API.
tools: Read, Grep, Glob
model: sonnet
---

Return file paths and a concise data-flow explanation.
Separate observed facts from assumptions.
Report an absent endpoint honestly.
Find the current contract before suggesting changes.
```

Ask the main agent to use contract-reader for a specific endpoint. State the goal and expected output rather than relying on implicit context.

The [subagent reference](https://code.claude.com/docs/en/sub-agents) documents supported fields. A definition-based helper starts from its own instructions and the task you supply. Forked subagents can inherit the main conversation instead; check support in the installed version. Memory scopes are `user`, `project` or `local`, not read-only/read-write access modes. The `tools` field in this definition restricts the helper’s tool set; it differs from a skill’s `allowed-tools` permission grant.

## Verify the handoff

Test an existing endpoint and a nonexistent one. The first response should cite real files; the second should report absence. Verify references yourself.

Compare direct and delegated execution on the same task. Measure elapsed time, all participants’ usage and clarification rounds, not just summary length. Separate context is not free execution.

## File ownership

A separate conversation does not prevent conflicting edits in a shared directory. Assign file ownership or use separate git worktrees when helpers write code. A worktree separates working files but is not a complete process, network or external-resource sandbox.

Before integration, inspect the diff and run tests. Uncommitted changes still count as changes even when no new commit exists.

Next: [agent teams](/en/courses/claude-code-guide/10-agent-teams/).
