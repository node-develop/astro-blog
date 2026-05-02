---
title: Now
description: What I'm working on right now in my job and pet projects. Updated roughly once a month.
sourceHash: c0dd34ffdc4036f5b6207571524598c2d8b642edc3ffae28d8882ac3ad57f852
manuallyEdited: false
---

> Last updated: 2026-05-02

This page is in the spirit of [nownownow.com](https://nownownow.com): what's in focus right now, without plans for a decade.

## Now

- **artka.dev v2** — turning the blog into an LLM-citable knowledge node. Spec: `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md`. EPIC A (foundation, schema-graph, robots/llms.txt) is deployed, EPIC B (entity pages) — in progress.
- **Claude Code Guide, EN** — final translations and fact-checking of English versions after changes in the RU source.
- **Experiments with MCP servers** — personal wiki + git-graph (GitNexus) inside the editor, testing the boundaries of tool-design for agents.

## Recently closed

- Structured data on the blog: unified `@graph`, `BlogPosting.articleBody`, `Blog` schema, `llms.txt`, `llms-full.txt`, named-bot rules.
- Bilingual pipeline (RU → EN via Claude Haiku 4.5) with per-key hash tracking and CI guard `pnpm translate:check`.
- Deployment via Dokploy webhook + migrations on container startup.

## What's next

- EPIC C from the spec: retrieval frontmatter (`summary`, `keywords`, `faq`) + MDX components `<Tldr>`/`<Faq>`/`<Compare>`.
- EPIC D: tag archives `/tags`, `/tags/<slug>`, related-posts by Jaccard overlap.
- Post-mortems on production tasks — formalize accumulated material.

---

If you'd like to discuss — write to [a@artka.dev](mailto:a@artka.dev).
