---
title: artka.dev (this blog)
description: "Personal publishing site on Astro 7: bilingual articles, courses, a content API and reproducible builds."
role: "Solo: design, backend, frontend, SEO, deploy"
status: active
pubDate: 2026-04-15 00:00:00+00:00
updatedDate: 2026-09-07
featured: true
stack:
  - Astro 7
  - TypeScript 6
  - PostgreSQL
  - Drizzle ORM
  - Better-Auth
  - Tailwind 4
  - Vitest 5
  - Playwright
  - Docker
  - GitHub Actions
  - Dokploy
outcomes:
  - Static articles with server routes for administration and API.
  - RU/EN content with translation and canonical URL checks.
  - Build-time Mermaid and LaTeX rendering.
  - A content API contract, image uploads and a publication queue.
links:
  - label: GitHub
    url: https://github.com/node-develop/astro-blog
  - label: Live
    url: https://artka.dev/
sourceHash: 58a9abca6e9d453eedd58d71219f7a32dbdafca56fd2389efd5cb63d9e2d7dc5
manuallyEdited: false
---

## What is running

This site combines articles, a course and project notes. Source and configuration are public on GitHub; package.json and the lockfile record dependencies.

Public articles are built as HTML. PostgreSQL stores server data, Better Auth handles authentication and Pagefind searches public content. Programmatic publishing uses the [Content API](/api/v1/openapi.json).

## Verifiable choices

- [Build-time Mermaid](/en/blog/mermaid-svg-playwright-build-time/): SVG in HTML rather than reader-side diagram rendering.
- [JSON-LD](/en/blog/json-ld-graph-astro/): shared author data and stable entity references.
- [robots.txt](/en/blog/robots-txt-ai-crawlers-2026/): separate policies for public content and private routes.

Builds and requests to deployed pages verify these mechanisms. They do not establish CTR or citation growth. Unsupported percentages and timing claims have been removed.

## Next step

Publish reproducible accounts of changes to the site: the problem, diff, verification and outcome. Code references give readers evidence beyond a summary of library features.
