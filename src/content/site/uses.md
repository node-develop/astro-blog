---
title: Что я использую
description: "Публичный toolkit: редактор, бэкенд-стек, инфраструктура, наблюдаемость, AI-инструменты — с версиями и обоснованиями."
---

> Снимок на 2026-11-13. Версии указываю там, где это важно для воспроизводимости.

## Редактор

- **WebStorm 2026.2** — основной IDE. Refactoring, навигация по символам, отладка,
  встроенный database tool — всё в одном месте, без переключений.
- **DataGrip 2026.2** — отдельный инстанс для Postgres-работы: схема, индексы,
  EXPLAIN-планы, миграции в режиме diff against drizzle-kit-output.
- **Claude Code (CLI)** — agentic driver для крупных задач. Запускается из
  любого репо, контекст из `CLAUDE.md`. WebStorm + Claude Code — два разных
  режима работы: ручной хирургический и агентный батч-режим.
- **Helix** — терминальный редактор для быстрых правок.
- **JetBrains Mono Variable** — шрифт.

## Бэкенд

- **Node.js 24 LTS** — runtime по умолчанию. TypeScript 5.9 (TS 6 пока ломает
  `@astrojs/check`).
- **PostgreSQL 18** — единственная БД, нужная 99% задач.
- **Drizzle ORM + drizzle-kit** — schema-first в TypeScript, миграции в SQL.
- **Postgres.js** — драйвер. Прямее и быстрее `pg`.
- **Better-Auth** — auth-инфраструктура с Postgres-адаптером. Используется
  на админке + теперь на course progress sync.
- **Zod 4** — все DTO/валидация.
- **Astro 5** — публичная часть и админка-острова.

## Инфра

- **Docker (multi-stage, `node:24-bookworm-slim`)** — никаких alpine для проектов
  с native-модулями.
- **GitHub Actions** — CI и build. Образы в ghcr.io.
- **Dokploy** — деплой через webhook после успешного push в main, миграции при
  старте контейнера.

## Наблюдаемость

- **Pino** — структурированные логи, JSON в stdout.
- **Sentry** — production-ошибки, source maps в build.
- **Plausible** — аналитика без cookies, DNT-aware. Cloud-инстанс, не self-host.
- **OpenTelemetry-ready** — спаны там, где есть смысл, без обязательного
  экспортёра.

## AI-инструменты

- **Claude Code** — daily driver. Opus 4.7 (1M context) для крупных рефакторингов
  и планирования, Sonnet для большинства задач, Haiku 4.5 для пайплайна
  переводов RU→EN.
- **Anthropic SDK (`@anthropic-ai/sdk`)** — рантайм-вызовы из скриптов и
  эндпоинтов (`/api/check` для CodeChallenge на курсе и т.п.).
- **MCP-серверы** — GitNexus (граф кода), llm-wiki (личная wiki). Подключаются
  через `.mcp.json`.
- **Skill / agent / hook system** — тонкая настройка Claude Code под этот репо:
  см. `.claude/`. Pre-tool hooks, custom skills (e.g. `pdf-extract`), subagents
  для параллельных задач.

## Сборка контента

- **Pagefind** — статический индекс для ⌘K-поиска. Билдится после `astro build`.
- **Satori + Resvg** — генерация per-post OG-картинок и сертификатов курсов в
  PNG прямо на сервере.
- **rehype-mermaid + Playwright** — Mermaid-диаграммы рендерятся в SVG на
  build-time. Cold-start холодный, кэш агрессивный.
- **rehype-katex** — LaTeX → KaTeX, билд-тайм.

---

Если что-то отсюда интересно — пишите на [a@artka.dev](mailto:a@artka.dev).
