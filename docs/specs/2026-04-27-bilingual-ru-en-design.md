# Bilingual RU/EN site — design

**Date:** 2026-04-27
**Status:** Approved (pending user review of this spec)
**Owner:** dev@artka.dev

## Goal

Add a Russian/English language toggle to the site. Russian remains the source of truth for all content. English versions are auto-generated at author-time by a translation script that calls the Claude API, with output committed to the repo. URLs preserve all existing paths for Russian; English lives under an `/en/` prefix.

## Non-goals

- Admin CMS support for editing English content (author edits RU; EN is derived).
- Per-locale tag pages (no tag pages exist today; this is unaffected).
- A second RSS feed (`/en/rss.xml`) — explicit v2 follow-up.
- Multi-language search of admin content (admin search is RU-only; public search uses Pagefind which is per-locale automatically).

## Architecture overview

```
┌─────────────────────────────────────────────────────────────┐
│  Source of truth (Russian)                                  │
│   src/content/posts/*.md           14 articles + drafts     │
│   src/content/site/{index,about}.md  hero/about prose       │
│   src/i18n/strings.ru.json         UI chrome (~25 strings)  │
│   src/i18n/tags.ru.json            tag slug → label map     │
└──────────────────────────┬──────────────────────────────────┘
                           │  pnpm translate
                           │  (Node script, Claude API)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Generated English (committed to git)                       │
│   src/content/posts/en/*.md        EN twins, sourceHash     │
│   src/content/site/en/*.md                                  │
│   src/i18n/strings.en.json                                  │
│   src/i18n/tags.en.json                                     │
└──────────────────────────┬──────────────────────────────────┘
                           │  pnpm build (Astro 5 i18n)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  Built site                                                 │
│   /                  RU home (default, unprefixed)          │
│   /blog/*            RU posts                               │
│   /en/               EN home                                │
│   /en/blog/*         EN posts                               │
│   Pagefind indices per language                             │
└─────────────────────────────────────────────────────────────┘
```

### Six conceptual pieces

1. **i18n routing.** Astro 5 built-in `i18n` config: `defaultLocale: "ru"` (no prefix), `locales: ["ru", "en"]`, EN gets `/en/` prefix.
2. **Content layout.** RU posts unchanged at `src/content/posts/*.md`. EN posts live at `src/content/posts/en/*.md` (subdirectory of the same collection, single `defineCollection`). Slugs differentiated by directory.
3. **Translation script.** `scripts/translate.ts`, run via `pnpm translate`. Reads RU sources, hashes content, calls Claude API only for changed/new files, writes EN files. Hand-edits in EN are protected by a `manuallyEdited: true` frontmatter flag.
4. **i18n message catalog.** `src/i18n/strings.{ru,en}.json` for UI chrome, `src/i18n/tags.{ru,en}.json` for tag display labels. Loaded into a small `t()` helper used in Astro components. Both `.en.json` files are translated by the same script with per-key hash tracking.
5. **Language toggle.** Header button. Clicking flips between current path and its counterpart (`/blog/X` ↔ `/en/blog/X`). Sets a `lang-pref` cookie. The cookie is read in middleware **only on the root path `/`** — visiting `/` with `lang-pref=en` redirects to `/en/`. Direct article links never auto-redirect.
6. **Fallback behavior.** If an EN twin doesn't exist (drafts, brand-new posts not yet translated), `/en/blog/X` returns 404 and the toggle on the corresponding RU page is disabled with a tooltip "English version not yet available."

### What is not changing

- Admin CMS — author edits RU only; EN is derived. No admin UI for translations in v1.
- DB schema — search vector backfill works on RU posts; EN gets its own Pagefind bundle.
- RSS feed — RU only (`/rss.xml`); `/en/rss.xml` is a v2 follow-up.
- Existing RU URLs — every current path keeps working unchanged.

## Translation pipeline (`scripts/translate.ts`)

The script is the load-bearing piece. It must never silently corrupt code blocks, math, or Mermaid diagrams.

### Inputs and outputs

| Input | Output | Skip condition |
|---|---|---|
| `src/content/posts/*.md` (excludes `posts/en/`) | `src/content/posts/en/<same-slug>.md` | EN file's `sourceHash` matches current source SHA-256 |
| `src/content/site/*.md` | `src/content/site/en/*.md` | same |
| `src/i18n/strings.ru.json` | `src/i18n/strings.en.json` | per-key hash match |
| `src/i18n/tags.ru.json` | `src/i18n/tags.en.json` | per-key hash match |

Drafts (`draft: true`) are skipped — no point translating unpublished work.

### Frontmatter contract for EN files

```yaml
---
title: "01. What Claude Code is: harness, agent loop, and your place in it"   # translated
description: "Before we unpack..."                                             # translated
pubDate: 2026-04-23                                                            # copied verbatim
updatedDate: 2026-04-26                                                        # copied verbatim if present
tags: [claude-code, guide]                                                     # SLUGS copied verbatim
draft: false                                                                   # copied verbatim
cover: /uploads/foo.png                                                        # copied verbatim
coverAlt: "Translated alt text"                                                # translated
sourceHash: "a3f1...e2"                                                        # SHA-256 of RU source file (script-managed)
manuallyEdited: false                                                          # if true, script never overwrites
---
```

### Tag handling

Tag slugs are stable identifiers — same in both languages. Display labels live in `src/i18n/tags.{ru,en}.json`:

```json
{ "claude-code": "Claude Code", "guide": "Guide", "ai-agents": "AI Agents" }
```

The script auto-appends new slugs encountered in any post's frontmatter to both files (with placeholder values copied from the slug if absent). Components display tags via `tags[slug] ?? slug`. Filter URLs (when tag filtering is later added) always use the slug, never the label.

### Translation rules

The Claude prompt enumerates **don't-touch zones**, but the script does not trust the model alone. A structural pre-pass walks the markdown AST (using `remark`, already a project dependency via `@astrojs/mdx`) and splits content into translatable and frozen segments before the API call.

| Segment | Treatment |
|---|---|
| Prose paragraphs, list items, headings, blockquotes | Translate |
| Inline code `` `code` `` | Verbatim |
| Fenced code blocks (```ts, ```js, etc.) | Verbatim, including comments inside |
| Mermaid blocks (```mermaid) | Labels translated, syntax frozen. Sent to Claude with explicit instructions: only translate text inside `[...]`, `{...}`, `("...")` quoted strings; never touch arrows, node IDs, keywords (`flowchart`, `subgraph`, etc.) |
| Math: `$...$`, `$$...$$` | Verbatim |
| HTML/JSX tags and attributes | Tags verbatim, text content translated, `alt=`/`title=` translated |
| Frontmatter | Handled separately per the contract above |
| Internal links `[text](/blog/01-foo)` | Text translated, URL rewritten to `/en/blog/01-foo` if EN twin exists, else left as-is and emitted as a warning |
| Internal `@docs/...` references in code/text | Verbatim — these are filesystem paths |
| External links `[text](https://...)` | Text translated, URL verbatim |
| KaTeX delimiters and content | Verbatim |

The prose-extraction approach replaces prose nodes with numbered placeholders, sends the placeholder list to Claude, and reassembles. This is the only reliable way to preserve code/math — string-level extraction is too fragile.

### The Claude call

- **Model:** `claude-sonnet-4-6` — capable enough for technical translation, ~5× cheaper than Opus. Haiku 4.5 was considered and rejected — translation quality on technical Russian is noticeably weaker.
- **Per-file call:** one request per article, prose extracted to numbered segments, Claude returns numbered translations. Stable, cacheable, deterministic enough.
- **Prompt cache:** system prompt with terminology guidance (proper nouns to keep: "Claude Code", "Astro", "MCP", model names; tone: technical, conversational, second-person "you") cached once across all files in a run via `cache_control: { type: "ephemeral" }`.
- **Cost estimate:** ~150KB Russian source × ~1.5 tokens/byte ≈ 225K input tokens + ~225K output. Sonnet 4.6 = $3/MTok in, $15/MTok out → roughly **$4 one-time**, then near-zero on incremental runs.
- **API key:** read from `ANTHROPIC_API_KEY` env var. Local-only — script does not run in CI.
- **Determinism:** `temperature: 0`, fixed system prompt, prose-extraction pre-pass.

### Manual override flag

If the author hand-edits an EN file and adds `manuallyEdited: true` to its frontmatter, the script will not overwrite that file on subsequent runs. Three sub-cases:

| State on EN file | RU source change since last hash? | Script behavior |
|---|---|---|
| `manuallyEdited: false` | no | skip (cache hit) |
| `manuallyEdited: false` | yes | re-translate, overwrite EN |
| `manuallyEdited: true` | no | skip silently |
| `manuallyEdited: true` | **yes** | **log a warning ("RU source changed since manual edit; EN may be stale"), do NOT touch the EN file, do NOT update `sourceHash`** |

The warning fires every run until the author either re-syncs the EN file by hand (and updates `sourceHash` themselves to the new value, or runs `pnpm translate -- --force <slug>`) or accepts the drift. This is honest — silently bumping the hash would erase the signal that source moved.

`pnpm translate -- --force <slug>` ignores both `sourceHash` and `manuallyEdited`. For when the system prompt changes and the author wants to re-baseline. The `manuallyEdited` flag in the EN file is reset to `false` after a force run.

### Failure modes and CI guard

- **API error / rate limit:** retry with exponential backoff (3 attempts), then log failed slugs and exit non-zero. Already-translated files in the run are kept.
- **Out-of-sync guard in CI:** `pnpm translate:check` (no API calls) recomputes source hashes and verifies every published RU post has a current EN twin. CI fails if drift is detected — forces the author to run `pnpm translate` and commit before merging.
- **Internal link warning:** if a translated article links to `/blog/X` and `X` has no EN twin yet, the script logs a warning but does not fail. The link survives in the EN article pointing to the RU page (better than 404).

## i18n routing, toggle UX, and chrome strings

### Astro 5 i18n config

In `astro.config.mjs`:

```ts
i18n: {
  defaultLocale: "ru",
  locales: ["ru", "en"],
  routing: {
    prefixDefaultLocale: false,    // RU at /, EN at /en/
    redirectToDefaultLocale: false // do not auto-redirect / → /ru/
  },
  fallback: { en: "ru" }
}
```

### URL map

| RU URL | EN counterpart |
|---|---|
| `/` | `/en/` |
| `/blog` | `/en/blog` |
| `/blog/01-introduction` | `/en/blog/01-introduction` |
| `/about` | `/en/about` |
| `/search` | `/en/search` |
| `/admin/*` | unchanged — admin is RU-only |
| `/api/*` | unchanged — APIs are language-neutral |
| `/login` | unchanged — RU-only auth UI v1 |

### Page implementation

For content-driven pages (home, about, blog index, post page), the `.astro` file uses `Astro.currentLocale` to pick which collection entries to load. For the post page specifically, `src/pages/blog/[...slug].astro` loads from the RU side; a parallel `src/pages/en/blog/[...slug].astro` loads from `posts/en/`. Two thin route files, both calling shared logic in `src/lib/content/loader.ts` parameterised by locale.

A single `[lang]/blog/[...slug].astro` with locale-as-param was considered and rejected — Astro 5 i18n with `prefixDefaultLocale: false` works more cleanly with sibling route trees, and the routing logic stays explicit and grep-friendly.

### Chrome strings

`src/i18n/strings.ru.json` (about 25 keys):

```json
{
  "nav.posts": "Статьи",
  "nav.about": "Обо мне",
  "nav.search": "Поиск",
  "home.eyebrow": "Personal blog · on writing code with AI",
  "home.cta": "Все статьи →",
  "home.latestLabel": "Последние публикации",
  "sidebar.guide": "Claude Code Guide",
  "sidebar.other": "Другие статьи",
  "post.toc": "Содержание",
  "post.published": "Опубликовано",
  "post.updated": "Обновлено",
  "post.tags": "Теги",
  "post.readMore": "Читать дальше →",
  "lang.toggle.ariaLabel": "Сменить язык",
  "lang.toggle.toEn": "EN",
  "lang.toggle.toRu": "RU",
  "lang.unavailable": "Английская версия пока недоступна",
  "footer.meta": "Astro · on-demand · WCAG AA"
}
```

`src/i18n/index.ts`:

```ts
import ru from "./strings.ru.json";
import en from "./strings.en.json";

const dict = { ru, en } as const;
export type Locale = keyof typeof dict;
export const t = (locale: Locale, key: keyof typeof ru): string =>
  dict[locale][key] ?? dict.ru[key];
```

Used in components as `t(Astro.currentLocale, "nav.posts")`. Type-checked: a typo in a key is a `tsc` error.

### Language toggle component

`src/components/LangToggle.astro`. Sits in the header, after the search button.

Server-side computation:

```ts
const currentPath = Astro.url.pathname;
const currentLocale = Astro.currentLocale;

const counterpart = currentLocale === "ru"
  ? `/en${currentPath === "/" ? "/" : currentPath}`
  : currentPath.replace(/^\/en/, "") || "/";

const counterpartExists = await checkCounterpartExists(currentPath, currentLocale);
```

`checkCounterpartExists` is a cheap helper — for `/blog/<slug>`, checks if `posts/en/<slug>.md` exists in the collection; for chrome pages, returns true.

Render:
- If counterpart exists → `<a href={counterpart} data-set-pref data-lang={target}>` with the target language label.
- If not → `<button disabled>` with `title={t(locale, "lang.unavailable")}` and the target label visually muted.

Cookie behavior (small inline `<script>` on the toggle):

```js
document.querySelector('[data-set-pref]')?.addEventListener('click', (e) => {
  const target = e.currentTarget.dataset.lang;
  document.cookie = `lang-pref=${target};path=/;max-age=31536000;samesite=lax`;
});
```

The cookie is read in middleware and acts **only on the root path `/`** — visiting `/` with `lang-pref=en` redirects to `/en/`. Direct article links never auto-redirect.

### `<head>` per-page metadata

`BaseLayout.astro` becomes locale-aware:

```astro
<html lang={Astro.currentLocale}>
  ...
  <link rel="canonical" href={canonical} />
  <link rel="alternate" hreflang="ru" href={ruVariant} />
  <link rel="alternate" hreflang="en" href={enVariant} />
  <link rel="alternate" hreflang="x-default" href={ruVariant} />
  <meta property="og:locale" content={Astro.currentLocale === "ru" ? "ru_RU" : "en_US"} />
  ...
</html>
```

`hreflang` is essential for Google to understand the language pair; `x-default` points to RU. Variants are computed by the same `getCounterpart()` helper used by the toggle — only emitted if the counterpart actually exists.

### Sitemap and RSS

- **Sitemap:** `@astrojs/sitemap` config gets `i18n: { defaultLocale: "ru", locales: { ru: "ru-RU", en: "en-US" } }`. Auto-emits `<xhtml:link rel="alternate" hreflang="...">` annotations.
- **RSS:** `/rss.xml` stays RU-only for v1. `/en/rss.xml` is a clearly-scoped v2 follow-up (copy `src/pages/rss.xml.ts` → `src/pages/en/rss.xml.ts`, filter EN posts).

## Schema and file layout changes

### Content collection schema (`src/content.config.ts`)

Add the two script-managed metadata fields so EN files validate. Add a new `site` collection:

```ts
const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string().min(3).max(120),
    description: z.string().min(10).max(200),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    sourceHash: z.string().optional(),
    manuallyEdited: z.boolean().default(false),
  }),
});

const site = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/site" }),
  schema: z.object({
    title: z.string(),
    sourceHash: z.string().optional(),
    manuallyEdited: z.boolean().default(false),
  }),
});

export const collections = { posts, site };
```

The glob pattern stays `**/*.{md,mdx}` — EN files in `posts/en/` are picked up automatically. Slug differentiation falls out of the directory: `01-introduction.md` → id `01-introduction`, `en/01-introduction.md` → id `en/01-introduction`.

### Files added

```
src/content/posts/en/                       NEW directory — EN article twins
  01-introduction.md
  02-context-and-cache.md
  ...
src/content/site/                           NEW collection — extracted hero/about prose
  index.md
  about.md
src/content/site/en/                        NEW
  index.md
  about.md
src/i18n/                                   NEW
  index.ts                                  t() helper, Locale type
  strings.ru.json                           ~25 chrome strings
  strings.en.json                           translated by script
  tags.ru.json
  tags.en.json
src/components/
  LangToggle.astro                          NEW — header toggle button
src/lib/i18n/
  routing.ts                                NEW — getCounterpart, checkCounterpartExists
  middleware.ts                             NEW — cookie redirect on root path
src/pages/en/                               NEW — sibling EN route tree
  index.astro
  about.astro
  blog/
    index.astro
    [...slug].astro
  search.astro
scripts/
  translate.ts                              NEW — main translation script
  lib/
    extract-prose.ts                        remark walker — splits MD into translatable + frozen segments
    claude-translate.ts                     Claude API wrapper, prompt strategy
    hash.ts                                 SHA-256 helper
    sync-check.ts                           used by translate:check (CI guard)
```

### Files modified

```
astro.config.mjs                  add i18n config block
src/content.config.ts             schema additions
src/middleware.ts                 chain in i18n root-redirect middleware after auth
src/layouts/BaseLayout.astro      <html lang>, hreflang/canonical/og:locale
src/components/Header.astro       insert <LangToggle/>; replace hardcoded labels with t()
src/components/SiteSidebar.astro  replace labels with t(); load locale-correct posts
src/components/PostTOC.astro      "Содержание" → t()
src/components/MobileDrawer.astro replace label with t()
src/components/SkipLink.astro     replace label with t()
src/pages/index.astro             extract prose to site/index.md; render via getEntry
src/pages/about.astro             extract prose to site/about.md
src/pages/blog/index.astro        load only RU posts; replace labels
src/pages/blog/[...slug].astro    load only RU posts; pass locale to layout
src/pages/search.astro            replace labels; pagefind reads <html lang>
src/lib/content/loader.ts         getOrderedPosts({ locale }) — filter by directory
src/components/search/CommandPalette.tsx  pass language to pagefind.init
src/pages/rss.xml.ts              filter to RU posts only (already implicit, make explicit)
package.json                      add "translate" and "translate:check" scripts
```

### Files NOT touched

- `src/pages/admin/*`, `src/pages/api/*`, `src/pages/login.astro`, admin auth in `src/middleware.ts`
- `drizzle/*` migrations, `src/lib/db/*`
- `src/lib/auth.ts`
- Search vector backfill (still RU only — EN gets Pagefind only in v1)
- `Dockerfile`, CI workflows (other than adding `pnpm translate:check`)

### Migration sequence (one-time, before v1 ships)

1. Land schema changes + i18n routing skeleton (no EN content yet) — verify RU still builds and renders identically.
2. Extract `index.astro` and `about.astro` prose into `src/content/site/{index,about}.md`. Verify pages render unchanged.
3. Wire `LangToggle` (initially disabled state since no EN twins exist).
4. Land translation script + `pnpm translate:check` CI guard (initially permissive — warns only).
5. Run `pnpm translate` locally for the first time. Review the diff — this is the most important review of the whole feature, since it baselines every translation. Hand-tune any obvious misses with `manuallyEdited: true`.
6. Commit EN content. Flip CI guard from warn → fail. Toggle becomes active site-wide.
7. Update `README.md` and `CLAUDE.md` with the new workflow: "after editing a RU post, run `pnpm translate` and commit the EN diff."

## Edge cases and operational details

- **Drafts** (`draft: true`): skipped by the script. Never appear in EN listing or EN search.
- **Brand-new RU post, EN not yet generated:** RU page builds; `/en/blog/<new-slug>` returns 404; toggle on the RU page is disabled.
- **Cover images:** `cover` is a `/uploads/...` URL, copied verbatim. `coverAlt` is translated. Same image, both languages.
- **Internal anchor links** (`/blog/01-foo#some-heading`): heading IDs are auto-generated from heading text by `rehype-slug`. Translated headings produce different IDs in EN, breaking the anchor. Mitigation: translate script logs anchor links as warnings; the author fixes them manually. Future v2: stable explicit `{#id}` anchors in source markdown.
- **Code blocks containing Russian text** (e.g. `console.log("Привет")`): rare and intentional — left verbatim. The example stays Russian even on the EN page. Acceptable.
- **`updatedDate` after re-translation:** EN file's `pubDate` and `updatedDate` mirror the RU values. The translation event itself is invisible to readers.
- **Pagefind multilingual:** Pagefind's `init()` detects `<html lang>` per page and segments indices automatically. The ⌘K palette currently calls `pagefind.search()` — needs `pagefind.init({ language: currentLocale })` or per-language filtering. One small change in `src/components/search/CommandPalette.tsx`.
- **Tags:** clicking a tag on an EN post should land on the EN tag page. Tag pages don't currently exist. When tag filtering is later added, do it per-locale. v1 punt: tags display but are not clickable.
- **ARIA labels** in components are RU now. All translated via `t()`.
- **Date formatting** in `index.astro` uses `toLocaleDateString("ru-RU", ...)`. Becomes `toLocaleDateString(locale === "ru" ? "ru-RU" : "en-US", ...)`.
- **404 page:** if/when added, exists at both `/404` and `/en/404` with translated copy.
- **OG image:** same image both languages; OG title/description are translated via the rendered page's metadata.

## Testing

### Unit (Vitest)

- `src/lib/i18n/routing.test.ts` — `getCounterpart()` for `/`, `/blog/X`, `/en/about`, edge cases.
- `scripts/lib/extract-prose.test.ts` — fixture-based: input MD with code/Mermaid/math/links, assert prose-only output and reassembly correctness.
- `src/lib/content/loader.test.ts` — locale filter (RU collection excludes `en/` slugs and vice versa).

### Integration (Vitest with Astro `getViteConfig()`)

- Build a mini fixture site, assert `/`, `/en/`, `/blog/X`, `/en/blog/X` all render with correct `<html lang>` and `hreflang` tags.

### E2e (Playwright)

- Toggle from `/blog/01-introduction` → lands on `/en/blog/01-introduction`, page content is English.
- Toggle disabled state when EN twin missing.
- Cookie behavior: visit `/` after setting `lang-pref=en` → redirected to `/en/`.
- Direct visit to `/en/blog/<known-slug>` works without cookie.

### Translation script tests

- `scripts/translate.test.ts` — mock the Claude client; verify hash-skip, `manuallyEdited` preservation, frontmatter merge logic, prose-segment reassembly.
- One smoke test that hits the real Claude API on a 100-word fixture, run only on demand (`pnpm test:smoke`), not in CI — to catch prompt regressions when upgrading models.

## Cost summary

- **One-time translation:** ~$4 (Claude Sonnet 4.6, full 14-part guide + chrome).
- **Incremental:** near-zero (only changed files re-translated, hash-keyed cache).
- **CI:** $0 (no API calls in CI; `translate:check` is filesystem-only).
- **Author workflow overhead:** one extra command (`pnpm translate`) and a diff review after editing RU content.

## Open questions punted to v2

- Admin CMS UI for hand-editing EN overrides without leaving the browser.
- `/en/rss.xml`.
- Per-locale tag pages and tag filtering.
- Stable explicit `{#anchor-id}` heading anchors in source markdown so internal anchor links survive translation.
- A third language (e.g. Spanish) — current design generalises to N locales but adds N×cost and complexity to the toggle UX.
