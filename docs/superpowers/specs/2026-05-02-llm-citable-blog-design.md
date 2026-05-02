# LLM-Citable Blog — design

**Date:** 2026-05-02
**Status:** Draft (pending user review)
**Owner:** dev@artka.dev

## Goal

Make `artka.dev` a **citation-ready knowledge node** for LLM-based systems (Claude, ChatGPT, Perplexity, Gemini, AI Overviews). Each public page must be (1) crawlable by named AI bots, (2) parseable as semantic HTML with structured data, (3) attributable to a single coherent author entity, (4) trustworthy via topical depth, and (5) retrievable as quote-ready chunks (TL;DR, FAQ, comparison, definition).

Optimization target is **passage extraction and citation**, not classic SERP ranking. Success metric: an LLM asked "что artka.dev пишет про harness Claude Code" returns a paragraph with a link.

## Non-goals

- Classic Google-keyword SEO and SERP A/B (covered well already).
- Redesign of layouts, typography, theming.
- Admin CMS additions (entity pages and posts authored as Markdown/Astro).
- Bilingual coverage of new entity pages in v1 — RU is source of truth, EN twins follow via `pnpm translate`.
- Tracking analytics / referrer dashboards for LLM citations (manual ad-hoc check in v1).
- Multi-author support (site is single-author by design).

## Current-state snapshot (audit, 2026-05-02)

| Layer | Score | Highlights |
|---|---|---|
| Crawl | 7/10 | `robots.txt`, sitemap RU/EN+hreflang, SSG, RSS RU+EN, OG/Twitter present. **Gaps:** no named AI-bot rules; no `llms.txt`/`llms-full.txt`. |
| Parse | 4/8 | Semantic HTML in layouts; single h1 in `PostLayout`. **Gaps:** no enforced h1-discipline in MDX bodies; no `<Tldr>`/`<Faq>`/`<Compare>`/`<Definition>` MDX components. |
| Entity | 1/8 | Minimal `/about`. **Gaps:** no `/now`, `/uses`, `/projects`, `/speaking`; no `AuthorCard`; no rich `Person` schema. |
| Authority | 2/6 | One topical cluster (Claude Code). **Gaps:** tags collected but non-clickable; no tag archive; no related-posts. |
| Retrieval | 0/8 | **Gaps:** no `summary/tldr` or `faq` frontmatter; no quote-ready blocks; `BlogPosting` JSON-LD lacks `articleBody`; schema entities duplicated inline without `@id` graph. |

Total ≈ **14/40 (35%)**. Target ≥ **36/40** within 3 sprints.

## Architecture overview

```
┌───────────────────────────────────────────────────────────────┐
│  AI-access surface (public root)                              │
│   /robots.txt          named bot rules (GPTBot, ClaudeBot, …) │
│   /llms.txt            short LLM policy + key URLs            │
│   /llms-full.txt       expanded "AI-README" (top posts plain) │
│   /sitemap-index.xml   RU+EN, hreflang                        │
│   /rss.xml /en/rss.xml full content:encoded                   │
└─────────────────────────┬─────────────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────────────┐
│  Entity layer (single coherent identity)                      │
│   /about    rich expert profile (years, stack, sameAs)        │
│   /now      what's in flight this month                       │
│   /uses     public toolkit                                    │
│   /projects portfolio with role/architecture/outcomes         │
│                                                               │
│   Schema graph (one JSON-LD @graph emitted by BaseLayout):    │
│   Person#me ──author──> BlogPosting#post                      │
│      │                       │                                │
│      └─sameAs──> [LinkedIn,GitHub,X]                          │
│   Organization#brand ──publisher──> BlogPosting#post          │
│   WebSite#site ──about──> Person#me                           │
│   Blog#blog ──blogPost──> BlogPosting#post                    │
└─────────────────────────┬─────────────────────────────────────┘
                          │
┌─────────────────────────▼─────────────────────────────────────┐
│  Retrieval layer (chunkable posts)                            │
│   Frontmatter:                                                │
│     summary  (TL;DR, 60–200 chars, REQUIRED for new posts)    │
│     keywords (semantic kw, distinct from tag-slugs)           │
│     faq      (Q/A pairs → FAQPage schema + <Faq> render)      │
│     lang     (explicit, mirrors path)                         │
│                                                               │
│   MDX components:                                             │
│     <Tldr>           top-of-post answer-first card            │
│     <KeyTakeaways>   3–5 bullets                              │
│     <Faq>            <details> + FAQPage JSON-LD              │
│     <Compare>        <table><caption> with verdict line       │
│     <Definition>     <dl><dt><dd>                             │
│                                                               │
│   PostLayout additions: AuthorCard + RelatedPosts (top-3 by   │
│   tag overlap, same locale).                                  │
└───────────────────────────────────────────────────────────────┘
```

### Six conceptual pieces

1. **AI-access surface.** `robots.txt` enumerates major AI crawlers explicitly (`Allow: /` for retrieval bots, denies for `/admin`, `/api`, `/login`); two new files `llms.txt` (short policy) and `llms-full.txt` (expanded AI-README) at the site root, generated from a shared template at build time.
2. **Single schema-graph in `BaseLayout`.** Today schemas are emitted per-page inline. Move all entity definitions into `src/lib/seo/schema.ts` returning a single `@graph` JSON-LD block; pages contribute a `BlogPosting`/`WebPage` node referencing the global `Person#me` and `Organization#brand` by `@id`.
3. **Entity pages.** Four new top-level routes: `/about` (extended), `/now`, `/uses`, `/projects`. RU is source of truth in `src/content/site/`; EN follows via existing translation pipeline. `/projects` is a small content collection (`src/content/projects/`) with frontmatter-driven cards and `CreativeWork` JSON-LD.
4. **Retrieval frontmatter & MDX components.** Extend the post zod schema with `summary`, `keywords`, `faq`, explicit `lang`. Add five MDX components under `src/components/mdx/` and auto-include them via `astro:mdx` so authors don't `import` per file. `<Tldr>` and `AuthorCard` render automatically when frontmatter fields are present; `<Faq>` doubles as `FAQPage` schema source.
5. **Authority surface.** Wire tags as clickable links to new `/tags/[slug]` archives (with `Blog` JSON-LD listing `BlogPosting`); add a `/tags` index. Implement `RelatedPosts` (top-3 by Jaccard tag overlap, same `lang`).
6. **Validation.** A unit test parses every post body and fails if it contains a top-level `# Heading`. A second test loads built JSON-LD via Vitest+JSDOM and validates against schema.org JSON-Schemas (subset). `pnpm translate:check` already guards EN drift; we add `pnpm seo:check` to the same CI lane.

### What is not changing

- Existing public URLs (`/blog/<slug>`, `/about`, `/`, `/en/...`) remain stable.
- Astro 5 i18n config (`prefixDefaultLocale: false`) — entity pages slot into the same routing model.
- Translation pipeline contract — we extend frontmatter, the script preserves new fields verbatim and re-translates only `summary`, `faq[].question`, `faq[].answer`, prose.
- Drizzle/admin/auth — untouched.
- Mermaid/KaTeX/Pagefind pipeline — untouched.

## AI-access surface details

### `robots.txt`

Replace the single `User-agent: *` block with named entries:

| Bot | Policy | Reason |
|---|---|---|
| `GPTBot` | Allow `/`, Disallow `/admin/`, `/api/`, `/login` | OpenAI training/answer crawler |
| `OAI-SearchBot` | Allow `/`, same disallow | OpenAI search/answers (separate UA) |
| `ChatGPT-User` | Allow `/`, same disallow | On-demand fetches by ChatGPT browsing |
| `ClaudeBot` | Allow `/`, same disallow | Anthropic crawler |
| `Claude-Web` / `anthropic-ai` | Allow `/`, same disallow | Anthropic on-demand fetcher |
| `PerplexityBot` | Allow `/`, same disallow | Perplexity answer crawler |
| `Perplexity-User` | Allow `/`, same disallow | Perplexity on-demand fetcher |
| `Google-Extended` | Allow `/`, same disallow | Gemini training opt-in |
| `Bingbot` | (existing) | classic SE; left as today |
| `*` (catch-all) | existing | fallback |

`Sitemap:` line preserved. Owner can later flip individual entries to `Disallow: /` if attitude changes; the table makes the toggle explicit per bot.

### `llms.txt`

Format per [llmstxt.org](https://llmstxt.org). Plain text, ≤ 4 KB. Must include:

```
# artka.dev

> Personal technical blog by Артём Кашута. Topics: AI agent engineering,
> Claude Code internals, Astro/Node.js backends, distributed systems.

## Authoritative pages
- [About the author](https://artka.dev/about): bio, expertise, contact
- [Projects](https://artka.dev/projects): portfolio with architecture and outcomes
- [Now](https://artka.dev/now): current work
- [Uses](https://artka.dev/uses): public toolchain

## Content
- [Blog index](https://artka.dev/blog): all articles
- [RSS](https://artka.dev/rss.xml): RU feed with full text
- [RSS EN](https://artka.dev/en/rss.xml): EN feed with full text

## Preferred attribution
Cite article title, author "Артём Кашута", and canonical URL.
```

### `llms-full.txt`

Generated at build time from the same data as the home page + the latest 20 posts. Plain text, ≤ 200 KB. Sections: site overview, author bio (~150 words), top expertise clusters with 1-line descriptions, then a compact list of posts in `## Title\n<URL>\n<TL;DR>\n` format. Built by a small Astro endpoint (`src/pages/llms-full.txt.ts`) returning `Content-Type: text/plain`.

## Schema-graph design

### Single source of truth

```ts
// src/lib/seo/schema.ts
export const graphIds = {
  person: "https://artka.dev/#person",
  organization: "https://artka.dev/#brand",
  website: "https://artka.dev/#website",
  blog: "https://artka.dev/#blog",
} as const;

export function buildGraph(input: { page: PageNode; locale: Locale }): JsonLdGraph
```

`buildGraph` always emits `Person`, `Organization`, `WebSite` nodes with their stable `@id`s. The page node (`BlogPosting`, `WebPage`, `CollectionPage`, `AboutPage`, etc.) is appended and references the globals by `@id`. `BaseLayout` calls `buildGraph(...)` once and emits a single `<script type="application/ld+json">` containing `{ "@context": "https://schema.org", "@graph": [...] }`.

### Required fields per node

| Node | Required | Source |
|---|---|---|
| `Person#me` | `name`, `url`, `image`, `jobTitle`, `description`, `knowsAbout[]`, `sameAs[]`, `email` | `src/content/site/about.md` frontmatter |
| `Organization#brand` | `name`, `url`, `logo`, `founder: {@id: person}` | constants in `schema.ts` |
| `WebSite#site` | `url`, `name`, `inLanguage`, `publisher: {@id: org}`, `potentialAction: SearchAction` | constants + i18n |
| `Blog#blog` | `url`, `name`, `inLanguage`, `author: {@id: person}`, `publisher: {@id: org}` | emitted on `/blog`, `/en/blog` |
| `BlogPosting#<slug>` | `headline`, `description`, `datePublished`, `dateModified`, `image`, `inLanguage`, `keywords`, `author: {@id: person}`, `publisher: {@id: org}`, `mainEntityOfPage`, `articleBody` (excerpt), `wordCount` | post frontmatter + body |
| `FAQPage` | emitted only when `faq[]` present | post frontmatter |
| `BreadcrumbList` | (existing) | unchanged |
| `WebPage` for entity pages | `name`, `description`, `inLanguage`, `about: {@id: person}` | `/about`, `/now`, `/uses`, `/projects` |

### `articleBody` truncation rule

Full body inflates HTML 2–3×. Compromise: emit first **800 words** of plain-text body (computed by stripping markdown via `remark-stringify` → text). Add `wordCount` covering the *full* body. This gives LLMs a substantial extractable chunk without doubling page weight.

## Retrieval-layer details

### Extended frontmatter (zod, in `src/content.config.ts`)

```ts
const post = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string().min(3).max(120),
    description: z.string().min(10).max(200),
    summary: z.string().min(60).max(280).optional(),  // NEW — TL;DR
    keywords: z.array(z.string()).default([]).optional(),  // NEW — distinct from tags
    faq: z.array(z.object({
      question: z.string().min(5),
      answer: z.string().min(20),
    })).optional(),  // NEW
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    author: z.string().default("Артём"),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    lang: z.enum(["ru", "en"]).optional(),  // NEW — explicit, default by path
    draft: z.boolean().default(false),
    sourceHash: z.string().optional(),
    manuallyEdited: z.boolean().optional(),
  }),
});
```

`summary` is **optional** (back-compat) but **required for posts after 2026-05-02** (enforced by a unit test reading `pubDate`). Translation pipeline auto-fills `summary` for new EN twins.

### MDX components

All five live under `src/components/mdx/` and are auto-injected via Astro's MDX `components` config so MD/MDX authors use them as global tags. Each is small (≤ 100 LoC), accessibility-checked, and has a unit test rendering it with sample input.

| Component | Markup | Schema side-effect |
|---|---|---|
| `<Tldr>` | `<aside class="tldr"><p>…</p></aside>` (single child or children) | none (used as visual cue) |
| `<KeyTakeaways items={[…]}>` | `<ul class="takeaways">` | none |
| `<Faq>` (consumes `frontmatter.faq` automatically; can also wrap children) | `<dl class="faq">` of `<details>` | emits `FAQPage` JSON-LD |
| `<Compare cols={…} rows={…} verdict="…">` | `<figure><table><caption>` + verdict `<p>` | none |
| `<Definition term="…">child</Definition>` | `<dl><dt>term</dt><dd>child</dd></dl>` | none |

### Auto-render behavior in `PostLayout`

If `frontmatter.summary` is present → render `<Tldr>` automatically above the post body. If `frontmatter.faq` is present → render `<Faq>` automatically below the body (above AuthorCard). Authors never need to import or place these tags manually for the auto-mode; the components remain importable for inline use.

### `AuthorCard`

Below post body. Avatar (link to `/about#me`), name, 1-line role from `Person#me.description`, link to `/about`, link to `/projects`. Renders the same on every post. Reads from `src/lib/seo/person.ts` (single source).

### `RelatedPosts`

Top-3 posts by Jaccard similarity over `tags` (intersection / union), filtered to same `lang`. Ties broken by `pubDate` desc. Computed at build time (Astro SSG), zero JS.

## Authority pages

### `/tags/index.astro`

List all tags from collection. Each → link to `/tags/<slug>`. Render `WebPage` schema. Add to sitemap.

### `/tags/[slug].astro`

`getStaticPaths()` enumerates unique slugs across both locales. Each page lists posts of that tag in current locale; emits `Blog` schema with `blogPost: [...]`. Pagination not needed at current scale (≤ 30 posts/tag).

### `Tag` chips

Two existing renderers (`blog/index.astro` line ~34, `PostLayout.astro` header) become `<a href="/tags/<slug>">` (RU) or `/en/tags/<slug>` (EN). Tag display label still resolved via `src/i18n/tags.{ru,en}.json`.

## Validation & CI

| Check | Implementation | When |
|---|---|---|
| No `# h1` in post bodies | Vitest test parses each `*.md`/`*.mdx` body, fails on `^# ` | `pnpm test` |
| `summary` required for posts after 2026-05-02 | Vitest test on collection schema | `pnpm test` |
| `faq[]` items shape valid | zod (already enforced by content config) | `pnpm typecheck` |
| JSON-LD parses cleanly + has expected `@id`s | Vitest + JSDOM rendering of representative pages | `pnpm test` |
| EN drift | existing `pnpm translate:check` | CI |
| llms.txt and llms-full.txt produced and non-empty | Vitest fetches built artifacts from `dist/` | post-build hook in CI |

## Failure modes

- **Schema-graph too large.** If full `articleBody` per post is included, hot pages may approach 50 KB JSON-LD. Mitigation: 800-word cap (above) and LZ-string is *not* applied — clarity beats compression for crawlers.
- **`lang` mismatch.** If `frontmatter.lang` and path locale disagree, `pnpm seo:check` fails the build. Default: derive from path if absent.
- **MDX auto-injection name collision.** `<Faq>` is unlikely to collide with user-authored components; documented in `CLAUDE.md`. Authors can still pass an inline override.
- **`/uses`/`/now` decay.** Pages need fresh `dateModified`. Add a Vitest warning (not failure) if `dateModified` on these pages is older than 90 days.

## Phasing summary (high-level; details in plan)

| Phase | Theme | Key deliverables |
|---|---|---|
| **1** | AI-access + schema-graph backbone | `robots.txt` rewrite, `llms.txt`, `llms-full.txt`, `src/lib/seo/schema.ts`, `BaseLayout` emits single `@graph`, `BlogPosting.articleBody` excerpt |
| **2** | Entity pages | `/about` extended, `/now`, `/uses`, `/projects` (+ collection), `AuthorCard` on posts |
| **3** | Retrieval components & frontmatter | extended zod schema, MDX components, auto-render `<Tldr>` and `<Faq>`, `RelatedPosts` |
| **4** | Authority graph | `/tags`, `/tags/<slug>`, clickable chips, `Blog` schema, h1-discipline test |
| **5** | Authority content (rolling) | TL;DR + 3 FAQ backfilled into top-10 posts; ≥ 3 new authority artifacts (postmortem / benchmark / architecture deep-dive) |

## Open questions

1. **`Organization` vs personal-brand only?** Treat `artka.dev` as a one-person brand `Organization#brand`, or omit and use `Person` as publisher? Decision: keep `Organization#brand` (matches today's behaviour, gives clean `publisher` field).
2. **`sameAs` URLs.** Need confirmed: LinkedIn URL, GitHub username, X handle, optional Telegram channel. Owner to provide before phase 2.
3. **Should `/now` and `/uses` exist in EN?** Default: yes, regenerated by `pnpm translate`. Owner can opt-out per page via `manuallyEdited: true`.
4. **`articleBody` excerpt size — 800 words or 1500?** Start at 800; revisit after first month of crawl logs.
5. **Avatar source.** `Person#me.image` needs a stable URL. Use `/og-default.svg` placeholder until owner provides a square photo (≥ 512×512 PNG).

## References

- Audit findings: this document, `Current-state snapshot` table.
- Existing layouts: `src/layouts/BaseLayout.astro`, `src/layouts/PostLayout.astro`.
- Existing schema emitters: `BaseLayout.astro:56–67`, `PostLayout.astro:47–95`.
- i18n contract: `docs/superpowers/specs/2026-04-27-bilingual-ru-en-design.md`.
- llmstxt.org spec, schema.org `BlogPosting` + `FAQPage` + `Person` references.
