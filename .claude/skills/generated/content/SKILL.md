---
name: content
description: "Skill for the Content area of astro-blog. 13 symbols across 6 files."
---

# Content

13 symbols | 6 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how buildSearchVectorSql, readPostFromDisk, listPostFiles work
- Modifying content-related functionality

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

- **`buildSearchVectorSql`** (Function) — `src/lib/search/vector.ts:15`
- **`readPostFromDisk`** (Function) — `src/lib/content/post-io.ts:10`
- **`listPostFiles`** (Function) — `src/lib/content/post-io.ts:24`
- **`parseFrontmatter`** (Function) — `src/lib/content/frontmatter.ts:15`
- **`setSearchVector`** (Function) — `src/lib/db/repo/posts-meta.ts:50`

## Key Symbols

| Symbol                 | Type     | File                                | Line |
| ---------------------- | -------- | ----------------------------------- | ---- |
| `buildSearchVectorSql` | Function | `src/lib/search/vector.ts`          | 15   |
| `readPostFromDisk`     | Function | `src/lib/content/post-io.ts`        | 10   |
| `listPostFiles`        | Function | `src/lib/content/post-io.ts`        | 24   |
| `parseFrontmatter`     | Function | `src/lib/content/frontmatter.ts`    | 15   |
| `setSearchVector`      | Function | `src/lib/db/repo/posts-meta.ts`     | 50   |
| `defaultMetaFor`       | Function | `src/lib/content/loader.ts`         | 10   |
| `sortWithMeta`         | Function | `src/lib/content/loader.ts`         | 21   |
| `getOrderedPosts`      | Function | `src/lib/content/loader.ts`         | 36   |
| `getPostWithMeta`      | Function | `src/lib/content/loader.ts`         | 52   |
| `serializeFrontmatter` | Function | `src/lib/content/frontmatter.ts`    | 39   |
| `main`                 | Function | `scripts/backfill-search-vector.ts` | 8    |
| `coerceDate`           | Function | `src/lib/content/frontmatter.ts`    | 59   |
| `toIsoDate`            | Function | `src/lib/content/frontmatter.ts`    | 69   |

## Execution Flows

| Flow                          | Type            | Steps |
| ----------------------------- | --------------- | ----- |
| `Main → CoerceDate`           | intra_community | 4     |
| `Main → BuildSearchVectorSql` | intra_community | 3     |

## How to Explore

1. `gitnexus_context({name: "buildSearchVectorSql"})` — see callers and callees
2. `gitnexus_query({query: "content"})` — find related execution flows
3. Read key files listed above for implementation details
