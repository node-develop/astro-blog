---
name: search
description: "Skill for the Search area of astro-blog. 6 symbols across 5 files."
---

# Search

6 symbols | 5 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how schedulePagefindRebuild, searchNode, searchPostsMeta work
- Modifying search-related functionality

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
