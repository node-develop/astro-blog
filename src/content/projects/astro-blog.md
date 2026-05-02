---
title: artka.dev (этот блог)
description: "Личный сайт и блог. Astro 5 SSG + динамическая админка, билингв RU/EN, рендер Mermaid и LaTeX в build-time."
role: "Solo: design, backend, frontend, deploy"
status: active
pubDate: 2026-04-15
updatedDate: 2026-05-02
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
  - "Билингв RU/EN с pipeline'ом перевода через Claude Haiku 4.5 и per-key hash tracking; CI-гвард `pnpm translate:check`."
  - "Структурированные данные одним `@graph` (Person/Organization/WebSite/Blog/BlogPosting) с articleBody-excerpt'ом для LLM-цитирования."
  - "Build-time рендер Mermaid через Playwright (SSR-safe SVG) и LaTeX через KaTeX."
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
- Mermaid через `rehype-mermaid` (Playwright) даёт SSR-safe SVG, без клиентского JS.
- Bilingual translation pipeline через Claude Haiku 4.5 окупается уже на 5–10 постах.

## Что дальше

Spec на v2: `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md`. Превращаю блог в LLM-citable knowledge node — entity-страницы (то, что вы читаете), retrieval frontmatter, MDX-компоненты.
