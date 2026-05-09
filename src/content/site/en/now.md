---
title: Now
description: >-
  What I'm doing right now — AI Automation in TaxDome, eval systems, retrieval pipelines, and evolution of the
  blog/personal MCP tools. Updated roughly once a month.
sourceHash: 0fa21092895acf57e3177a878fd837c655a945a519e778cd4863707bb3e98627
manuallyEdited: false
---

> Last updated: 2026-05-09

This is a page in the spirit of [nownownow.com](https://nownownow.com): what's in focus right
now, without plans for a decade.

## Work

**AI Automation Engineer (contract), [TaxDome](https://taxdome.com)** —
since January 2026.

I design and deliver end-to-end LLM/agent workflows in Python and TypeScript:
LangGraph for orchestration, LangChain for core components, n8n for glue.
Direct calls to OpenAI / Anthropic / Gemini APIs where fine-grained token
and latency control is needed.

Current focus:

- **Eval systems.** Prompt regression suites via LangSmith traces, structured
  outputs, and golden datasets — to prevent agent quality degradation
  as prompts and models evolve.
- **Retrieval pipelines.** Chunking, embeddings, hybrid search, reranking
  over internal documents and CRM data. Services on FastAPI, agents —
  on the consumer side.
- **AI MVP end-to-end.** Backend + lightweight frontend + AWS infrastructure in Docker —
  to quickly validate hypotheses and cut time-to-value.
- **Continuous reassessment** of new models, agentic frameworks, and tooling
  (Claude Code, Cursor) — what works as a daily driver for the team.

## Personal Projects

- **artka.dev v2 — final rollout.** All four EPICs from the spec
  `2026-05-02-llm-citable-blog-design.md` are shipped: unified JSON-LD `@graph`,
  retrieval frontmatter (`summary`/`keywords`/`faq`), `<Tldr>` / `<Faq>` /
  `<Compare>` / `<Definition>` / `<KeyTakeaways>` MDX components, tag archives
  and related posts via Jaccard. Now polishing **Phase 5**: courses on top of the same
  content model, progress via PostgreSQL + Better-Auth, on-demand
  PNG certificates, and per-course RSS.
- **Claude Code Guide → course.** A series of 14 posts migrated into a full-fledged
  course with interactive exercises (`<ExerciseCheck>`, `<CodeChallenge>`),
  auto-progress via dwell-time + IntersectionObserver, and a certificate
  at 100% completion.
- **MCP tooling.** Personal GitNexus (code graph) + llm-wiki as a daily driver
  for agents. Experimenting with tool-design boundaries: what to give agents first-class,
  what goes in reference docs, what goes in hooks.

## Recently Closed

- **Blog SEO audit — two waves of fixes.** Identity refresh via JSON-LD graph
  (Person with real CV, `sameAs`, raster avatar, and Organization logo), title
  and description tuned to AI/backend profile, BreadcrumbList + WebPage / CollectionPage
  on every landing, JSON Feed 1.1 alongside RSS, per-page OG for all landings.
- **Phase 4 dev ergonomics.** View transitions on title/cards, Plausible
  (DNT-aware), split sitemap by locale, reading time, course player scaffold.
- **Phase 3 retrieval & SEO.** Pagefind ⌘K, RelatedPosts via Jaccard, per-post
  OG via Satori build hook, Buttondown newsletter, Giscus.
- **Phase 2 reading.** ReadingProgress, footnotes as side-notes on ≥1280 px,
  rehype-autolink-headings with `#` anchors, Shiki dual-theme (`github-light` /
  `github-dark-dimmed`) with `[data-theme]` swap.
- **Phase 1 design system.** Paper/sienna palette, dark variant, ThemeToggle
  with no-flash bootstrap, lockup in mono.

## What's Next

- **Postmortems on production incidents in agent systems.** Turn accumulated
  raw material from 9RED Wallet and current work into public writeups on tool design,
  eval loops, and guardrails (ETA: December 2026 – January 2027).
- **Second course.** Still in outline stage, direction: "Production-ready agent
  loops: harness, eval, guardrails." If there's a topic you'd like to see —
  let me know.
- **Open-source several MCP servers** once I stabilize the API.

---

If you'd like to discuss — write to [a@artka.dev](mailto:a@artka.dev) or
[Telegram](https://t.me/akv6020).
