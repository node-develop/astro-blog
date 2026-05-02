---
title: Claude Code Guide (EN, 14 parts)
description: >-
  A series of fourteen articles on Claude Code architecture: harness/agent loop, context, skills, hooks, MCP, subagents,
  models, and antipatterns.
role: Author, editor, translator (RU → EN)
status: maintained
pubDate: 2026-04-01T00:00:00.000Z
updatedDate: 2026-04-27T00:00:00.000Z
featured: true
stack:
  - Markdown / MDX
  - Mermaid (build-time)
  - Astro content collections
  - Bilingual pipeline (Claude Haiku 4.5)
outcomes:
  - 14 parts, ~80 thousand characters in RU. Coverage from harness/agent loop to antipatterns.
  - Complete EN translation with per-key hash tracking; CI guard prevents pushing RU without EN counterpart commit.
  - "Each part is a standalone artifact for citation: TL;DR + clear subheadings."
links:
  - label: Index (RU)
    url: https://artka.dev/blog
  - label: Index (EN)
    url: https://artka.dev/en/blog
sourceHash: a5d23fcf5a4b0d4f42c9f043672c78cd63c139b485a42753510f0d38a94a6897
manuallyEdited: false
---

## Context

Most Claude Code tutorials are either "install and write" or "here's my workflow." There was a gap in material that explains **how it works inside**: what a harness is, how context window is calculated, how a skill differs from an agent, how hooks plug into the lifecycle.

## Structure

14 parts, each 3,000–8,000 characters: introduction and harness/agent loop; context window; CLAUDE.md and system context; skills; hooks; MCP servers and tool design; subagents; models (Opus/Sonnet/Haiku); plan mode; worktrees; cost mechanics; Travel Agent blueprint; best practices; verification of claims.

## What I learned

- Translation through an LLM pipeline delivers stable quality only as long as RU remains coherent — any mid-sentence edit breaks the hash.
- Mermaid diagrams in technical text pay for themselves: they become part of the content that LLMs extract.
- TL;DR blocks at the start (introduced in EPIC C) boost citation likelihood more than correct H-headers.

## What's next

EPIC C parent-spec: add `summary`/`faq` frontmatter and MDX components to the existing 14 parts.
