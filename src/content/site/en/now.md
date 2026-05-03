---
title: Now
description: What I'm working on right now in my job and pet projects. Updated roughly once a month.
sourceHash: 02f5dc1d23b1be6531deb80064d1f080ad8c3a40bc48fd6370fd362e7d776baf
manuallyEdited: false
---

> Last updated: 2026-11-13

This page is in the spirit of [nownownow.com](https://nownownow.com): what's in focus right now, without plans for a decade.

## Now

- **artka.dev v2 — final rollout.** All four EPICs from the spec
  `2026-05-02-llm-citable-blog-design.md` are released: unified JSON-LD `@graph`,
  retrieval-frontmatter (`summary`/`keywords`/`faq`), `<Tldr>` / `<Faq>` /
  `<Compare>` / `<Definition>` / `<KeyTakeaways>` MDX components, tag archives
  and related-posts via Jaccard. Right now I'm polishing **Phase 5**: lesson-courses
  on top of the same content model, progress via Postgres + Better-Auth, on-demand
  PNG certificates and per-course RSS.
- **Claude Code Guide → course.** A series of 14 posts is migrating into a full-fledged
  `claude-code-guide` course with interactive exercises (`<ExerciseCheck>`,
  `<CodeChallenge>`), auto-progress via dwell-time + IntersectionObserver and
  a certificate for 100% completion.
- **MCP-tooling.** Personal GitNexus (code graph) + llm-wiki as daily driver
  for agents. Right now I'm experimenting with tool-design boundaries: what to give
  an agent as a first-class citizen, what goes in reference docs, what goes in hooks.

## Recently closed

- **Phase 4 dev-ergonomics.** View transitions on title/cards, Plausible
  (DNT-aware), split sitemap by locales, reading-time, course-player scaffold.
- **Phase 3 retrieval & SEO.** Pagefind ⌘K, RelatedPosts via Jaccard overlap,
  per-post OG via Satori build hook, Buttondown newsletter, Giscus.
- **Phase 2 reading.** ReadingProgress, footnotes as side-notes on ≥1280px,
  rehype-autolink-headings with `#` anchors, Shiki dual-theme (`github-light` /
  `github-dark-dimmed`) with `[data-theme]` swap.
- **Phase 1 design system.** Paper/sienna palette, dark variant,
  ThemeToggle with no-flash bootstrap, lockup in mono.

## What's next

- Postmortems on production incidents — turn accumulated raw material
  into public writeups (ETA: December–January).
- Second course — still in outline stage, direction: "Production-ready agent
  loops: harness, eval, guardrails". If there's a topic you'd like to see —
  let me know.
- Open-sourcing several MCP servers once I stabilize the API.

---

If you'd like to discuss — write to [a@artka.dev](mailto:a@artka.dev).
