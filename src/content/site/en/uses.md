---
title: What I Use
description: "Public toolkit: editor, backend stack, infrastructure, observability, AI tools — with versions and rationales."
sourceHash: 8a97d9591ec0066d62058f984631e106c6d8ed8c1527dc234e7264f45d17d77c
manuallyEdited: false
---

> Snapshot as of 2026-05-02. Versions are specified where important for reproducibility.

## Editor

- **Cursor / VS Code** — main editor. Cursor when you need an agent in the IDE, VS Code when you want minimalism.
- **Claude Code (CLI)** — main driver for large tasks. Runs from any repo, context from CLAUDE.md.
- **Helix** — terminal editor for quick edits.
- **JetBrains Mono Variable** — font.

## Backend

- **Node.js 24 LTS** — default runtime. TypeScript 5.9 (TS 6 still breaks `@astrojs/check`).
- **PostgreSQL 18** — the only database you need for 99% of tasks.
- **Drizzle ORM + drizzle-kit** — schema-first in TypeScript, migrations in SQL.
- **Postgres.js** — driver. More straightforward and faster than `pg`.
- **Zod 4** — all DTO/validation.
- **Astro 5** — public part and admin islands.

## Infrastructure

- **Docker (multi-stage, `node:24-bookworm-slim`)** — no alpine for projects with native modules.
- **GitHub Actions** — CI and build. Images in ghcr.io.
- **Dokploy** — deploy via webhook after successful push to main.

## Observability

- **Pino** — structured logs, JSON to stdout.
- **Sentry** — production errors, source maps in build.
- **OpenTelemetry-ready** — spans where it makes sense, no mandatory exporter.

## AI Tools

- **Claude Code** — daily driver. Opus 4.7 (1M context) for large refactorings and planning, Sonnet for most tasks, Haiku 4.5 for the translation pipeline.
- **Anthropic SDK (`@anthropic-ai/sdk`)** — runtime calls from scripts and endpoints.
- **MCP servers** — GitNexus (code graph), llm-wiki (personal wiki). Connected via `.mcp.json`.
- **Skill / agent / hook system** — fine-tuning Claude Code for this repo: see `.claude/`.

---

If anything here interests you — write to [a@artka.dev](mailto:a@artka.dev).
