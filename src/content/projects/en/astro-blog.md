---
title: artka.dev (this blog)
description: >-
  Personal website and blog. Astro 5 SSG + dynamic admin panel, bilingual RU/EN, Mermaid and LaTeX rendering at
  build-time, complete JSON-LD graph markup.
role: "Solo: design, backend, frontend, SEO, deploy"
status: active
pubDate: 2026-04-15T00:00:00.000Z
updatedDate: 2026-05-09T00:00:00.000Z
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
    Bilingual RU/EN with translation pipeline via Claude Haiku 4.5 and per-key hash tracking; CI guard `pnpm
    translate:check` blocks push on drift.
  - >-
    Complete JSON-LD `@graph` markup
    (Person/Organization/WebSite/Blog/BlogPosting/BreadcrumbList/WebPage/CollectionPage/ItemPage) with
    articleBody-excerpt for LLM citation; per-page OG via Satori for each landing.
  - >-
    Build-time Mermaid rendering via Playwright (SSR-safe SVG) and LaTeX via KaTeX — zero client-side JS on static
    pages.
  - >-
    Course player on top of content collections: progress in Postgres + Better-Auth, auto-complete by dwell-time,
    on-demand PNG certificates, per-course RSS.
  - "Deploy: GHCR + Dokploy webhook; migrations on container startup."
links:
  - label: GitHub
    url: https://github.com/artka-dev/astro-blog
  - label: Live
    url: https://artka.dev
sourceHash: 60860b62a9fe1871916d654f8e3aff29c3b539dc399fc3d3bed6b69a6506a695
manuallyEdited: false
---

## Context

I wanted one simple site for all my publications, without a CMS zoo. Astro 5 — the natural choice: SSG for content, on-demand islands where you need a server.

## Architecture

- **Content** in Markdown/MDX in `src/content/posts/*.md`. Source of truth — RU; EN — auto-generated via translation script with git-committed artifacts.
- **Admin panel** — SSR-only routes under `/admin/*`, protected by middleware with Better-Auth.
- **Database** — Postgres + Drizzle. Stores `posts_meta` (curated order, pinned, hidden) and search_vector for FTS.
- **Search** — Pagefind for the public part (static), Postgres FTS for the admin panel.
- **SEO/LLM** — single `@graph` JSON-LD from `src/lib/seo/`, `llms.txt`/`llms-full.txt`, named-bot rules in `robots.txt`.

## What I learned

- Astro 5 i18n with `prefixDefaultLocale: false` works great if RU is the source of truth and EN gets the `/en/` prefix.
- Mermaid via `rehype-mermaid` (Playwright) gives SSR-safe SVG without client-side JS — but 32 diagrams add 5–10 seconds to cold-start builds.
- Bilingual translation pipeline via Claude Haiku 4.5 pays for itself on 5–10 posts. Per-key hash tracking prevents re-translation of unchanged content.
- Single JSON-LD `@graph` with stable `@id` and cross-references — a much more "citable" signal for LLM crawlers than scattered inline blocks.
- Smart suffix in title (`{title} | artka.dev`) at the layout level removes the burden from page authors to remember the brand — and this is dozens of CTR percentage points stronger than just a good title.

## What's next

Post-mortems from production incidents in agent systems, a second course on production-ready agent loops, open-sourcing several MCP servers. See [/now](/now).
