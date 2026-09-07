---
title: How to verify claims about Claude Code
blurb:
  Verify commands, configuration and benchmarks. A correction record and evidence checklist for assessing technical
  material.
pubDate: 2026-04-23
order: 14
locale: en
updatedDate: 2026-09-07
---

A documentation link at the end of an article does not establish every claim. Connect each factual statement to a source and a check. This lesson replaces the previous unconditional verification table, which itself contained incorrect claims.

## Corrections

| Previous claim                               | Correction                                      |
| -------------------------------------------- | ----------------------------------------------- |
| Imports reduce startup context               | Imported text loads; imports organize files     |
| Skill allowed-tools is a strict whitelist    | It pre-approves tools                           |
| Subagent memory uses read-only               | Use documented memory scopes                    |
| Teams automatically lock edited source files | Task claiming does not protect each source file |
| action:block is a universal hook decision    | The protocol depends on the event               |
| .mcp.local.json stores standard local scope  | Local MCP configuration is in ~/.claude.json    |
| /cost reports yesterday’s spending           | It describes the current session                |
| Every task saves a fixed percentage          | Measure actual usage and conditions             |

Relevant lessons provide details and sources. These corrections are not a promise that future client versions remain identical.

## Three kinds of evidence

Documentation describes the supported contract. Source code explains a particular implementation. A run demonstrates behavior in one environment. When they disagree, preserve versions and a minimal example rather than selecting the convenient answer.

Check commands through help, frontmatter against the correct client, SDK examples against a pinned package and prices against provider billing.

## Record a claim

```text
Claim:
Version and environment:
Primary source and review date:
Minimal example:
Observed result:
Not verified:
```

Complete this for “the hook runs after Edit.” Reproduce success, then deliberately break the matcher. If the check cannot distinguish them, it is insufficient.

## Assess benchmarks

Look for task definitions, success criteria, attempts, raw results and environment details. Confidence cannot replace missing evidence. Generation speed and time to a completed programming task are different measurements.

This revision removes unsupported percentages, speculative commands and the claim of a ready-made Travel Agent. Teaching examples and unperformed experiments are labeled explicitly.

## Report an error

Send the URL, exact statement, tool version and minimal example through [contact](/en/contact/). Omit secrets and full work logs containing other people’s data.

Return to the [course index](/en/courses/claude-code-guide/).
