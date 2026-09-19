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
  - label: Author's GitHub
    url: https://github.com/node-develop
  - label: Live
    url: https://artka.dev/
sourceHash: 8877bf4c2b541ec69897ea6548a192349cbefc6e1ec986dc06459a97446bf8be
manuallyEdited: false
---

## What is running

This site combines articles, a course and project notes. The source code is not published: the GitHub link points to the author's profile, not to this site's repository. Dependency versions are recorded in package.json and the lockfile.

Public articles are built as HTML. PostgreSQL stores server data, Better Auth handles authentication and Pagefind searches public content. Programmatic publishing uses the [Content API](/api/v1/openapi.json).

## Verifiable choices

- [Build-time Mermaid](/en/blog/mermaid-svg-playwright-build-time/): SVG in HTML rather than reader-side diagram rendering.
- [JSON-LD](/en/blog/json-ld-graph-astro/): shared author data and stable entity references.
- [robots.txt](/en/blog/robots-txt-ai-crawlers-2026/): separate policies for public content and private routes.

Builds and requests to deployed pages verify these mechanisms. They do not establish CTR or citation growth. Unsupported percentages and timing claims have been removed.

## Next step

Publish reproducible accounts of changes to the site: the problem, diff, verification and outcome. Code references give readers evidence beyond a summary of library features.
