---
name: search
description: "Skill for the Search area of astro-blog. 6 symbols across 5 files."
---

# Search

6 symbols | 5 files | Cohesion: 100%

## When to Use

Invoke this skill when the task matches one of these patterns:

- **Command palette UI** — bug, keyboard shortcut, result rendering, accessibility, or styling in `CommandPalette.tsx`. Client-side island.
- **Pagefind rebuild orchestration** — adjust debouncing, scheduling, or invalidation in `schedulePagefindRebuild` / `runRebuild` (e.g. after publishing a post, after migration).
- **Pagefind client/server bridge** — change how `loadPagefind` resolves the artifact, or how `searchNode` runs the query server-side (used in API routes / SSR).
- **DB-backed metadata search** — modify `searchPostsMeta` (Postgres tsvector lookup against `posts_meta`). Pairs with the `content` skill (`buildSearchVectorSql`, `setSearchVector`).

**Do NOT invoke** for adding new UI fields to the palette UX without changing search backends (that's `frontender`), for full-text vector backfill scripts (that's `content`), or for SEO/metadata work unrelated to search.

**Fail-loud reminder:** if a rebuild silently swallows an error (pagefind binary missing, output dir unwritable), surface it — never let "search returned no results" mask a broken rebuild.

## Key Files

| File                                       | Symbols                             |
| ------------------------------------------ | ----------------------------------- |
| `src/lib/search/pagefind-rebuild.ts`       | schedulePagefindRebuild, runRebuild |
| `src/lib/search/pagefind-node.ts`          | searchNode                          |
| `src/lib/db/repo/posts-meta.ts`            | searchPostsMeta                     |
| `src/lib/search/pagefind-client.ts`        | loadPagefind                        |
| `src/components/search/CommandPalette.tsx` | CommandPalette                      |

## Entry Points

Start here when exploring this area:

- **`schedulePagefindRebuild`** (Function) — `src/lib/search/pagefind-rebuild.ts:17`
- **`searchNode`** (Function) — `src/lib/search/pagefind-node.ts:28`
- **`searchPostsMeta`** (Function) — `src/lib/db/repo/posts-meta.ts:62`
- **`loadPagefind`** (Function) — `src/lib/search/pagefind-client.ts:10`
- **`CommandPalette`** (Function) — `src/components/search/CommandPalette.tsx:12`

## Key Symbols

| Symbol                    | Type     | File                                       | Line |
| ------------------------- | -------- | ------------------------------------------ | ---- |
| `schedulePagefindRebuild` | Function | `src/lib/search/pagefind-rebuild.ts`       | 17   |
| `searchNode`              | Function | `src/lib/search/pagefind-node.ts`          | 28   |
| `searchPostsMeta`         | Function | `src/lib/db/repo/posts-meta.ts`            | 62   |
| `loadPagefind`            | Function | `src/lib/search/pagefind-client.ts`        | 10   |
| `CommandPalette`          | Function | `src/components/search/CommandPalette.tsx` | 12   |
| `runRebuild`              | Function | `src/lib/search/pagefind-rebuild.ts`       | 32   |

## How to Explore

1. `gitnexus_context({name: "schedulePagefindRebuild"})` — see callers and callees
2. `gitnexus_query({query: "search"})` — find related execution flows
3. Read key files listed above for implementation details
