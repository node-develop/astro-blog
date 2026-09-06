---
name: content
description: "Skill for the Content area of astro-blog. 13 symbols across 6 files."
---

# Content

13 symbols | 6 files | Cohesion: 100%

## When to Use

Invoke this skill when the task matches one of these patterns:

- **Frontmatter parsing** — bug in `parseFrontmatter` / `serializeFrontmatter`, adding new field types (dates, arrays), edge cases in `coerceDate` / `toIsoDate`.
- **Reading and listing posts** — `readPostFromDisk`, `listPostFiles`: filters, sort order, traversal of content directories.
- **Ordering for render** — `getOrderedPosts`, `getPostWithMeta`, `sortWithMeta`, `defaultMetaFor`: changing sort logic on the home page, RSS, or tag archives.
- **Search vector** — backfill via `scripts/backfill-search-vector.ts`, or changes to `buildSearchVectorSql` / `setSearchVector` (Postgres full-text search).

**Do NOT invoke** for the search UI (use `search`), for writing posts to disk (`fs` — `writePostAtomically`), or for the admin frontmatter form (`admin`).

## Key Files

| File                                | Symbols                                                        |
| ----------------------------------- | -------------------------------------------------------------- |
| `src/lib/content/frontmatter.ts`    | parseFrontmatter, coerceDate, serializeFrontmatter, toIsoDate  |
| `src/lib/content/loader.ts`         | defaultMetaFor, sortWithMeta, getOrderedPosts, getPostWithMeta |
| `src/lib/content/post-io.ts`        | readPostFromDisk, listPostFiles                                |
| `scripts/backfill-search-vector.ts` | main                                                           |
| `src/lib/search/vector.ts`          | buildSearchVectorSql                                           |
| `src/lib/db/repo/posts-meta.ts`     | setSearchVector                                                |

## Entry Points

Start here when exploring this area:

- **`buildSearchVectorSql`** (Function) — `src/lib/search/vector.ts`
- **`readPostFromDisk`** (Function) — `src/lib/content/post-io.ts`
- **`listPostFiles`** (Function) — `src/lib/content/post-io.ts`
- **`parseFrontmatter`** (Function) — `src/lib/content/frontmatter.ts`
- **`setSearchVector`** (Function) — `src/lib/db/repo/posts-meta.ts`

## Key Symbols

Line numbers are omitted on purpose — they go stale; locate symbols with Grep or `gitnexus_context`. Frontmatter YAML goes through `src/lib/yaml.ts` (never `js-yaml` directly).

| Symbol                 | Type     | File                                |
| ---------------------- | -------- | ----------------------------------- |
| `buildSearchVectorSql` | Function | `src/lib/search/vector.ts`          |
| `readPostFromDisk`     | Function | `src/lib/content/post-io.ts`        |
| `listPostFiles`        | Function | `src/lib/content/post-io.ts`        |
| `parseFrontmatter`     | Function | `src/lib/content/frontmatter.ts`    |
| `setSearchVector`      | Function | `src/lib/db/repo/posts-meta.ts`     |
| `defaultMetaFor`       | Function | `src/lib/content/loader.ts`         |
| `sortWithMeta`         | Function | `src/lib/content/loader.ts`         |
| `getOrderedPosts`      | Function | `src/lib/content/loader.ts`         |
| `getPostWithMeta`      | Function | `src/lib/content/loader.ts`         |
| `serializeFrontmatter` | Function | `src/lib/content/frontmatter.ts`    |
| `main`                 | Function | `scripts/backfill-search-vector.ts` |
| `coerceDate`           | Function | `src/lib/content/frontmatter.ts`    |
| `toIsoDate`            | Function | `src/lib/content/frontmatter.ts`    |

## Execution Flows

| Flow                          | Type            | Steps |
| ----------------------------- | --------------- | ----- |
| `Main → CoerceDate`           | intra_community | 4     |
| `Main → BuildSearchVectorSql` | intra_community | 3     |

## How to Explore

1. `gitnexus_context({name: "buildSearchVectorSql"})` — see callers and callees
2. `gitnexus_query({query: "content"})` — find related execution flows
3. Read key files listed above for implementation details
