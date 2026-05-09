---
title: What I Use
description: >-
  Public toolkit: editor, backend stack, AI tools, infrastructure and observability — the same tools I use at work and
  in pet projects.
sourceHash: 472e869596cb673b0f8083e7847966fc38f2686dbc71e0c0bd11405d6f31b8b1
manuallyEdited: false
---

> Snapshot as of 2026-05-09. I specify versions where they affect reproducibility.

## Editors / IDE

- **WebStorm 2026.2** — primary IDE for TypeScript / Node.js / frontend. Refactoring,
  symbol navigation, debugging, built-in database tool — everything in one place,
  without switching.
- **PyCharm 2026.2** — primary IDE for Python (FastAPI, scripts, eval pipelines).
- **DataGrip 2026.2** — separate instance for PostgreSQL work: schema, indexes,
  EXPLAIN plans, migrations in diff mode against drizzle-kit / alembic.
- **Cursor** — agentic editor for experimenting with code agents outside Claude Code.
- **Claude Code (CLI)** — daily driver for large tasks. Runs from any repo, context from `CLAUDE.md`. WebStorm/PyCharm + Claude Code — two modes of work: manual surgical and agentic batch mode.
- **Helix** — terminal editor for quick edits.
- **JetBrains Mono Variable** — font.

## AI / LLM

- **Claude Code** — daily driver. Opus 4.7 (1M context) for large refactorings and planning, Sonnet for most tasks, Haiku 4.5 for the RU→EN translation pipeline.
- **Cursor** — parallel AI editor; useful where the built-in chat is closer to the code than the CLI cycle.
- **Anthropic, OpenAI, Gemini SDK** — direct runtime calls when you need fine-grained token/latency control (`/api/check` for CodeChallenge, eval suites, retrieval services).
- **LangGraph** — orchestration of multi-step agent workflows. Clear state machines on top of tool-use loops.
- **LangChain** — basic primitives (chains, prompts, output parsers, retrievers).
- **LangSmith** — traces, eval datasets, regression suites. Without it, agent quality degrades imperceptibly with each prompt tweak.
- **n8n, Make** — glue for integrations and automation where you don't need a full service.
- **MCP servers** — GitNexus (code graph), llm-wiki (personal wiki), computer-use (when needed). Connected via `.mcp.json`.
- **Skill / agent / hook system** — fine-tuning Claude Code for this repo: see `.claude/`. Pre-tool hooks, custom skills, subagents for parallel tasks.

## Backend

- **Python 3.13 + FastAPI** — primary stack for production AI/agent services and retrieval pipelines. Pydantic validation, async-first.
- **Node.js 24 LTS + TypeScript 5.9** — TS 6 currently breaks `@astrojs/check` and `zod-to-ts`. Fastify for high-throughput services; Express for legacy.
- **gRPC** — inter-service communication. On the previous project, migrating 20+ microservices from Kafka/GraphQL Federation to gRPC gave −32% latency.
- **REST, GraphQL, webhooks** — where they make sense.
- **Event sourcing on Apache Kafka** — for high-throughput systems with audit requirements. Idempotency via outbox pattern and dedup keys.
- **Astro 5** — public part and admin islands of this blog.
- **Better-Auth** — auth infrastructure with PostgreSQL adapter. Used on the admin panel + course progress sync.
- **Zod 4** — all DTOs and validation on the TypeScript stack.
- **Drizzle ORM + drizzle-kit** — schema-first in TypeScript, migrations in SQL.
- **Postgres.js** — driver. More direct and faster than `pg`.

## Data

- **PostgreSQL 18 + PostGIS** — the only database you need for 99% of tasks. FTS, JSONB, partial indexes, EXPLAIN-first approach.
- **MongoDB, DynamoDB** — where you need a document model or AWS-native features.
- **Redis** — caches, rate limiting, dedup keys, pub/sub for realtime.
- **Apache Kafka** — event sourcing, inter-service exchange on high load.
- **RabbitMQ** — task queues, RPC, fan-out.
- **ORMs:** Drizzle (TS), Prisma, Sequelize.

## Cloud / orchestration

- **AWS** — EKS, S3, RDS, CloudWatch.
- **Kubernetes** — production workloads, HPA by custom metrics from Prometheus.
- **Docker (multi-stage, `node:24-bookworm-slim`)** — no alpine for projects with native modules. Images in ghcr.io / private ECR.
- **GitLab CI/CD** — on commercial projects.
- **GitHub Actions** — on opensource and personal projects. For the blog — image in ghcr.io.
- **Dokploy** — deploy the blog via webhook after successful push to main, migrations on container startup.

## Observability

- **OpenTelemetry → Collector → Prometheus → Grafana** — full-stack telemetry, built from scratch at the previous job. SLO/SLI dashboards, alerts, error budgets. Gave −45% MTTR.
- **Grafana Mimir** — long-term storage for traces.
- **Pino** — structured logs, JSON to stdout.
- **Sentry** — production errors, source maps in build.
- **Plausible** — analytics without cookies, DNT-aware. Cloud instance.

## Content build (this blog)

- **Pagefind** — static index for ⌘K search. Builds after `astro build`.
- **Satori + Resvg** — per-post / per-landing OG image and course certificate generation in PNG right on the server.
- **rehype-mermaid + Playwright** — Mermaid diagrams render to SVG at build time. Cold start is cold, cache is aggressive.
- **rehype-katex** — LaTeX → KaTeX, build time.
- **Vitest 3 + Playwright** — unit + e2e tests.

---

If anything here interests you — write to [a@artka.dev](mailto:a@artka.dev).
