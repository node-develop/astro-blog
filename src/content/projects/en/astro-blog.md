---
title: artka.dev (this blog)
description: >-
  Personal website and blog. Astro 5 SSG + dynamic admin panel, bilingual RU/EN, Mermaid and LaTeX rendering at
  build-time.
role: "Solo: design, backend, frontend, deploy"
status: active
pubDate: 2026-04-15T00:00:00.000Z
updatedDate: 2026-05-02T00:00:00.000Z
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
  - SSG-first site with on-demand islands for admin panel and SSR-only routes for authentication.
  - >-
    Bilingual RU/EN with translation pipeline via Claude Haiku 4.5 and per-key hash tracking; CI-guard `pnpm
    translate:check`.
  - >-
    Structured data in a single `@graph` (Person/Organization/WebSite/Blog/BlogPosting) with articleBody-excerpt for LLM
    citation.
  - Build-time Mermaid rendering via Playwright (SSR-safe SVG) and LaTeX via KaTeX.
  - "Deploy: GHCR + Dokploy webhook; migrations on container startup."
links:
  - label: GitHub
    url: https://github.com/artka-dev/astro-blog
  - label: Live
    url: https://artka.dev
sourceHash: 5682cea580efddc6b6ecd175f3977c5b205cfc4ae8ffb527e691440f86524f81
manuallyEdited: false
---

## Context

I wanted a simple site for all my publications without a CMS zoo. Astro 5 is the natural choice: SSG for content, on-demand islands where you need a server.

## Architecture

- **Content** in Markdown/MDX in `src/content/posts/*.md`. Source of truth — RU; EN — auto-generated via translation script with git-committed artifacts.
- **Admin panel** — SSR-only routes under `/admin/*`, protected by middleware with Better-Auth.
- **Database** — Postgres + Drizzle. Stores `posts_meta` (curated order, pinned, hidden) and search_vector for FTS.
- **Search** — Pagefind for the public part (static), Postgres FTS for the admin panel.
- **SEO/LLM** — unified `@graph` JSON-LD from `src/lib/seo/`, `llms.txt`/`llms-full.txt`, named-bot rules in `robots.txt`.

## What I learned

- Astro 5 i18n with `prefixDefaultLocale: false` works great if RU is the source of truth and EN gets the `/en/` prefix.
- Mermaid via `rehype-mermaid` (Playwright) gives SSR-safe SVG without client-side JS.
- Bilingual translation pipeline via Claude Haiku 4.5 pays for itself at 5–10 posts.

## What's next

Spec for v2: `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md`. Turning the blog into an LLM-citable knowledge node — entity pages (what you're reading), retrieval frontmatter, MDX components.
