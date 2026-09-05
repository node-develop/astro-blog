---
name: search
description: "Skill for the Search area of astro-blog: ⌘K Pagefind modal, no-JS /search page, Postgres metadata search, Pagefind rebuild scheduling."
---

# Search

Two search paths share one source of truth (`posts_meta.search_vector` in Postgres + the Pagefind index built from `dist/client`):

- **Browser (JS):** `src/components/Search.astro` — ⌘K / Ctrl+K modal, loads `/pagefind/pagefind.js` lazily (`loadPagefind` inside the component script), rich excerpts from the Pagefind WASM bundle.
- **Server (no-JS fallback):** `src/pages/search.astro` and `src/pages/en/search.astro` → `searchNode` → `searchPostsMeta` (tsvector lookup). Excerpts come from frontmatter `description`, drafts are excluded.

## When to Use

Invoke this skill when the task matches one of these patterns:

- **Search modal UI** — keyboard shortcut, result rendering, accessibility, styling, or the `search:open` window event in `src/components/Search.astro`. This is an `.astro` component with an inline `<script>`, not a React island.
- **Pagefind rebuild orchestration** — debounce/scheduling/invalidation in `schedulePagefindRebuild` / `runRebuild` (`src/lib/search/pagefind-rebuild.ts`), triggered from `src/actions/posts.ts` after a post is saved. `REBUILD_DEBOUNCE_MS` lives there too.
- **Server-side search** — `searchNode` (`src/lib/search/pagefind-node.ts`): locale handling (`/blog` vs `/en/blog`), slug prefix stripping, result shape `NodeSearchHit`.
- **DB-backed metadata search** — `searchPostsMeta` and `setSearchVector` in `src/lib/db/repo/posts-meta.ts`, SQL built by `buildSearchVectorSql` (`src/lib/search/vector.ts`). Pairs with the `content` skill for the backfill script.

**Do NOT invoke** for adding UI that does not touch search backends (that's `frontender`), for the full-text vector backfill script (`content` skill, `scripts/backfill-search-vector.ts`), or for SEO/metadata work unrelated to search.

**Fail-loud reminder:** if a rebuild silently swallows an error (pagefind binary missing, output dir unwritable), surface it — never let "search returned no results" mask a broken rebuild. Same for the modal: a missing `/pagefind/pagefind.js` must show the "Pagefind not built" hint, not an empty list.

## Key Files

| File                                                  | Symbols                                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/components/Search.astro`                         | search modal markup + inline script (`loadPagefind`, open/close, keyboard handling) |
| `src/pages/search.astro`, `src/pages/en/search.astro` | no-JS search pages calling `searchNode`                                             |
| `src/lib/search/pagefind-node.ts`                     | `searchNode`, `NodeSearchHit`                                                       |
| `src/lib/search/pagefind-rebuild.ts`                  | `schedulePagefindRebuild`, `runRebuild`, `REBUILD_DEBOUNCE_MS`, `__testReset`       |
| `src/lib/search/vector.ts`                            | `buildSearchVectorSql`, `SearchVectorParts`                                         |
| `src/lib/db/repo/posts-meta.ts`                       | `searchPostsMeta`, `setSearchVector`, `SearchHit`                                   |
| `src/actions/posts.ts`                                | caller of `schedulePagefindRebuild`                                                 |

Line numbers are intentionally omitted — they go stale; use Grep or `gitnexus_context` to locate symbols.

## Entry Points

Start here when exploring this area:

- **`searchNode`** — server-side search, the simplest end-to-end path.
- **`schedulePagefindRebuild`** — how content changes reach the Pagefind index.
- **`Search.astro`** — everything the visitor sees.

## How to Explore

1. `gitnexus_context({name: "searchNode"})` — see callers and callees
2. `gitnexus_query({query: "search"})` — find related execution flows
3. Read key files listed above for implementation details
