---
title: Что я использую
description: "Публичный toolkit: редактор, бэкенд-стек, инфраструктура, наблюдаемость, AI-инструменты — с версиями и обоснованиями."
---

> Снимок на 2026-05-02. Версии указываю там, где это важно для воспроизводимости.

## Редактор

- **Cursor / VS Code** — основной редактор. Cursor когда нужен агент в IDE, VS Code когда хочется минимализма.
- **Claude Code (CLI)** — main driver для крупных задач. Запускается из любого репо, контекст из CLAUDE.md.
- **Helix** — терминальный редактор для быстрых правок.
- **JetBrains Mono Variable** — шрифт.

## Бэкенд

- **Node.js 24 LTS** — runtime по умолчанию. TypeScript 5.9 (TS 6 пока ломает `@astrojs/check`).
- **PostgreSQL 18** — единственная БД, нужная 99% задач.
- **Drizzle ORM + drizzle-kit** — schema-first в TypeScript, миграции в SQL.
- **Postgres.js** — драйвер. Прямее и быстрее `pg`.
- **Zod 4** — все DTO/валидация.
- **Astro 5** — публичная часть и админка-острова.

## Инфра

- **Docker (multi-stage, `node:24-bookworm-slim`)** — никаких alpine для проектов с native-модулями.
- **GitHub Actions** — CI и build. Образы в ghcr.io.
- **Dokploy** — деплой через webhook после успешного push в main.

## Наблюдаемость

- **Pino** — структурированные логи, JSON в stdout.
- **Sentry** — production-ошибки, source maps в build.
- **OpenTelemetry-ready** — спаны там, где есть смысл, без обязательного экспортёра.

## AI-инструменты

- **Claude Code** — daily driver. Opus 4.7 (1M context) для крупных рефакторингов и планирования, Sonnet для большинства задач, Haiku 4.5 для пайплайна переводов.
- **Anthropic SDK (`@anthropic-ai/sdk`)** — рантайм-вызовы из скриптов и эндпоинтов.
- **MCP-серверы** — GitNexus (граф кода), llm-wiki (личная wiki). Подключаются через `.mcp.json`.
- **Skill / agent / hook system** — тонкая настройка Claude Code под этот репо: см. `.claude/`.

---

Если что-то отсюда интересно — пишите на [a@artka.dev](mailto:a@artka.dev).
