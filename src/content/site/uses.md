---
title: Что я использую
description: "Публичный toolkit: редактор, бэкенд-стек, AI-инструменты, инфраструктура и наблюдаемость — то же, чем я пользуюсь на работе и в пет-проектах."
---

> Снимок на 2026-05-09. Версии указываю там, где они влияют на воспроизводимость.

## Редакторы / IDE

- **WebStorm 2026.2** — основной IDE для TypeScript / Node.js / фронта. Refactoring,
  навигация по символам, отладка, встроенный database tool — всё в одном месте,
  без переключений.
- **PyCharm 2026.2** — основной IDE для Python (FastAPI, скрипты, eval-пайплайны).
- **DataGrip 2026.2** — отдельный инстанс для PostgreSQL-работы: схема, индексы,
  EXPLAIN-планы, миграции в режиме diff против drizzle-kit / alembic.
- **Cursor** — agentic-редактор для experiment'ов с агентами кода вне Claude Code.
- **Claude Code (CLI)** — daily driver для крупных задач. Запускается из любого
  репо, контекст из `CLAUDE.md`. WebStorm/PyCharm + Claude Code — два режима
  работы: ручной хирургический и агентный батч-режим.
- **Helix** — терминальный редактор для быстрых правок.
- **JetBrains Mono Variable** — шрифт.

## AI / LLM

- **Claude Code** — daily driver. Opus 4.7 (1M context) для крупных рефакторингов
  и планирования, Sonnet для большинства задач, Haiku 4.5 для пайплайна
  переводов RU→EN.
- **Cursor** — параллельный AI-редактор; полезен там, где встроенный chat ближе
  к коду, чем CLI-цикл.
- **Anthropic, OpenAI, Gemini SDK** — прямые вызовы из рантайма, когда нужно
  тонкое управление токенами/латенси (`/api/check` для CodeChallenge, eval-suites,
  retrieval-сервисы).
- **LangGraph** — оркестрация многошаговых agent workflows. Чёткие state-машины
  поверх tool-use loop'ов.
- **LangChain** — базовые примитивы (chains, prompts, output parsers, retrievers).
- **LangSmith** — traces, eval-датасеты, regression suites. Без него agent quality
  деградирует незаметно с каждой подкруткой промпта.
- **n8n, Make** — glue для интеграций и автоматизации, где не нужен полноценный
  service.
- **MCP-серверы** — GitNexus (граф кода), llm-wiki (личная wiki), computer-use
  (когда нужно). Подключаются через `.mcp.json`.
- **Skill / agent / hook system** — тонкая настройка Claude Code под этот репо:
  см. `.claude/`. Pre-tool hooks, custom skills, subagents для параллельных задач.

## Backend

- **Python 3.13 + FastAPI** — основной стек для production AI/agent-сервисов
  и retrieval-пайплайнов. Pydantic-валидация, async-first.
- **Node.js 24 LTS + TypeScript 5.9** — TS 6 пока ломает `@astrojs/check`
  и `zod-to-ts`. Fastify для high-throughput сервисов; Express для legacy.
- **gRPC** — межсервисная коммуникация. На прошлом проекте миграция 20+
  микросервисов с Kafka/GraphQL Federation на gRPC дала −32% latency.
- **REST, GraphQL, webhooks** — там, где они уместны.
- **Event sourcing на Apache Kafka** — для систем с высокой пропускной способностью
  и audit-требованиями. Идемпотентность через outbox pattern и dedup-keys.
- **Astro 5** — публичная часть и админка-острова этого блога.
- **Better-Auth** — auth-инфраструктура с PostgreSQL-адаптером. Используется
  на админке + course progress sync.
- **Zod 4** — все DTO и валидация на TypeScript-стеке.
- **Drizzle ORM + drizzle-kit** — schema-first в TypeScript, миграции в SQL.
- **Postgres.js** — драйвер. Прямее и быстрее `pg`.

## Data

- **PostgreSQL 18 + PostGIS** — единственная БД, нужная 99% задач. FTS, JSONB,
  partial indexes, EXPLAIN-первый подход.
- **MongoDB, DynamoDB** — там, где нужна document-модель или AWS-нативность.
- **Redis** — кэши, rate limit, dedup-keys, pub/sub для realtime.
- **Apache Kafka** — event sourcing, межсервисный обмен на high-load.
- **RabbitMQ** — task queues, RPC, fan-out.
- **ORMs:** Drizzle (TS), Prisma, Sequelize.

## Cloud / оркестрация

- **AWS** — EKS, S3, RDS, CloudWatch.
- **Kubernetes** — production-нагрузки, HPA по custom metrics из Prometheus.
- **Docker (multi-stage, `node:24-bookworm-slim`)** — никаких alpine для
  проектов с native-модулями. Образы в ghcr.io / private ECR.
- **GitLab CI/CD** — на коммерческих проектах.
- **GitHub Actions** — на opensource и личных проектах. Для блога — образ в ghcr.io.
- **Dokploy** — деплой блога через webhook после успешного push в main,
  миграции при старте контейнера.

## Observability

- **OpenTelemetry → Collector → Prometheus → Grafana** — full-stack telemetry,
  собранная с нуля на прошлой работе. SLO/SLI-дашборды, алерты, error budgets.
  Дала −45% MTTR.
- **Grafana Mimir** — long-term storage для traces.
- **Pino** — структурированные логи, JSON в stdout.
- **Sentry** — production-ошибки, source maps в build.
- **Plausible** — аналитика без cookies, DNT-aware. Cloud-инстанс.

## Сборка контента (этот блог)

- **Pagefind** — статический индекс для ⌘K-поиска. Билдится после `astro build`.
- **Satori + Resvg** — генерация per-post / per-landing OG-картинок и сертификатов
  курсов в PNG прямо на сервере.
- **rehype-mermaid + Playwright** — Mermaid-диаграммы рендерятся в SVG на
  build-time. Cold-start холодный, кэш агрессивный.
- **rehype-katex** — LaTeX → KaTeX, build-time.
- **Vitest 3 + Playwright** — unit + e2e тесты.

---

Если что-то отсюда интересно — пишите на [a@artka.dev](mailto:a@artka.dev).
