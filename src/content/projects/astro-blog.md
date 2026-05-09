---
title: artka.dev (этот блог)
description: "Личный сайт и блог. Astro 5 SSG + динамическая админка, билингв RU/EN, рендер Mermaid и LaTeX на build-time, полная JSON-LD граф-разметка."
role: "Solo: design, backend, frontend, SEO, deploy"
status: active
pubDate: 2026-04-15
updatedDate: 2026-05-09
featured: true
stack:
  - Astro 5
  - TypeScript 5.9
  - PostgreSQL 18
  - Drizzle ORM
  - Better-Auth
  - Tailwind 4
  - Vitest 3
  - Playwright
  - Docker
  - GitHub Actions
  - Dokploy
outcomes:
  - "SSG-первый сайт с on-demand островами для админки и SSR-only маршрутами для авторизации."
  - "Билингв RU/EN с pipeline'ом перевода через Claude Haiku 4.5 и per-key hash tracking; CI-гвард `pnpm translate:check` блокирует пуш с дрейфом."
  - "Полная JSON-LD `@graph`-разметка (Person/Organization/WebSite/Blog/BlogPosting/BreadcrumbList/WebPage/CollectionPage/ItemPage) с articleBody-excerpt'ом для LLM-цитирования; per-page OG через Satori для каждого landing."
  - "Build-time рендер Mermaid через Playwright (SSR-safe SVG) и LaTeX через KaTeX — нулевой клиентский JS на статических страницах."
  - "Курс-плеер поверх content collections: прогресс в Postgres + Better-Auth, авто-complete по dwell-time, on-demand PNG-сертификаты, per-course RSS."
  - "Деплой: GHCR + Dokploy webhook; миграции при старте контейнера."
links:
  - label: GitHub
    url: https://github.com/artka-dev/astro-blog
  - label: Live
    url: https://artka.dev
---

## Контекст

Хотел один простой сайт под все мои публикации, без CMS-зоопарка. Astro 5 — естественный выбор: SSG для контента, on-demand острова там, где нужен сервер.

## Архитектура

- **Контент** в Markdown/MDX в `src/content/posts/*.md`. Source of truth — RU; EN — auto-generated через скрипт перевода с git-committed артефактами.
- **Админка** — SSR-only маршруты под `/admin/*`, защищены middleware с Better-Auth.
- **БД** — Postgres + Drizzle. Хранит `posts_meta` (curated order, pinned, hidden) и search_vector для FTS.
- **Поиск** — Pagefind для публичной части (статика), Postgres FTS для админки.
- **SEO/LLM** — единый `@graph` JSON-LD из `src/lib/seo/`, `llms.txt`/`llms-full.txt`, named-bot rules в `robots.txt`.

## Что узнал

- Astro 5 i18n с `prefixDefaultLocale: false` отлично работает, если RU — источник правды и EN получают `/en/`-префикс.
- Mermaid через `rehype-mermaid` (Playwright) даёт SSR-safe SVG, без клиентского JS — но 32 диаграммы добавляют 5–10 секунд cold-start билда.
- Bilingual translation pipeline через Claude Haiku 4.5 окупается уже на 5–10 постах. Per-key hash tracking предотвращает re-translation неизменённого контента.
- Единый JSON-LD `@graph` со стабильными `@id` и cross-references — гораздо более «citable» сигнал для LLM-краулеров, чем разрозненные inline-блоки.
- Smart-suffix в title (`{title} | artka.dev`) на уровне layout снимает с авторов страниц обязанность помнить про бренд — и это на десятки CTR-процентов сильнее, чем просто goодый title.

## Что дальше

Постмортемы с production-инцидентов агентских систем, второй курс про
production-ready agent loops, open-source нескольких MCP-серверов. См. [/now](/now).
