---
title: What I Use
description: "Public toolkit: editor, backend stack, infrastructure, observability, AI tools — with versions and rationales."
sourceHash: a3a04ffc171add974a30f5212a377fd68c468815e2f545087de92b07fda4c228
manuallyEdited: false
---

> Snapshot as of 2026-11-13. Versions specified where important for reproducibility.

## Editor

- **WebStorm 2026.2** — primary IDE. Refactoring, symbol navigation, debugging,
  built-in database tool — everything in one place, no switching.
- **DataGrip 2026.2** — separate instance for Postgres work: schema, indexes,
  EXPLAIN plans, migrations in diff-against-drizzle-kit-output mode.
- **Claude Code (CLI)** — agentic driver for large tasks. Runs from any repo,
  context from `CLAUDE.md`. WebStorm + Claude Code — two different work modes:
  manual surgical and agentic batch mode.
- **Helix** — terminal editor for quick edits.
- **JetBrains Mono Variable** — font.

## Backend

- **Node.js 24 LTS** — default runtime. TypeScript 5.9 (TS 6 currently breaks
  `@astrojs/check`).
- **PostgreSQL 18** — the only database needed for 99% of tasks.
- **Drizzle ORM + drizzle-kit** — schema-first in TypeScript, migrations in SQL.
- **Postgres.js** — driver. More direct and faster than `pg`.
- **Better-Auth** — auth infrastructure with Postgres adapter. Used on the admin
  panel + now on course progress sync.
- **Zod 4** — all DTO/validation.
- **Astro 5** — public part and admin islands.

## Infrastructure

- **Docker (multi-stage, `node:24-bookworm-slim`)** — no alpine for projects
  with native modules.
- **GitHub Actions** — CI and build. Images in ghcr.io.
- **Dokploy** — deploy via webhook after successful push to main, migrations on
  container startup.

## Observability

- **Pino** — structured logs, JSON to stdout.
- **Sentry** — production errors, source maps in build.
- **Plausible** — analytics without cookies, DNT-aware. Cloud instance, not
  self-hosted.
- **OpenTelemetry-ready** — spans where it makes sense, no mandatory exporter.

## AI Tools

- **Claude Code** — daily driver. Opus 4.7 (1M context) for large refactorings
  and planning, Sonnet for most tasks, Haiku 4.5 for the RU→EN translation
  pipeline.
- **Anthropic SDK (`@anthropic-ai/sdk`)** — runtime calls from scripts and
  endpoints (`/api/check` for CodeChallenge on the course, etc.).
- **MCP servers** — GitNexus (code graph), llm-wiki (personal wiki). Connected
  via `.mcp.json`.
- **Skill / agent / hook system** — fine-tuning Claude Code for this repo:
  see `.claude/`. Pre-tool hooks, custom skills (e.g. `pdf-extract`), subagents
  for parallel tasks.

## Content Build

- **Pagefind** — static index for ⌘K search. Built after `astro build`.
- **Satori + Resvg** — per-post OG image and course certificate generation in
  PNG directly on the server.
- **rehype-mermaid + Playwright** — Mermaid diagrams rendered to SVG at build
  time. Cold start is cold, cache is aggressive.
- **rehype-katex** — LaTeX → KaTeX, build time.

---

If anything here interests you — write to [a@artka.dev](mailto:a@artka.dev).
