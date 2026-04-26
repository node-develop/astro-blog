---
name: fs
description: "Skill for the Fs area of astro-blog. 6 symbols across 3 files."
---

# Fs

6 symbols | 3 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how writePostAtomically, resolveSafe, makeMediaSubpath work
- Modifying fs-related functionality

## Key Files

| File                         | Symbols                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `src/lib/fs/media-writer.ts` | makeMediaSubpath, safeBaseName, exists, writeMediaToPublic |
| `src/lib/fs/post-writer.ts`  | writePostAtomically                                        |
| `src/lib/fs/paths.ts`        | resolveSafe                                                |

## Entry Points

Start here when exploring this area:

- **`writePostAtomically`** (Function) — `src/lib/fs/post-writer.ts:13`
- **`resolveSafe`** (Function) — `src/lib/fs/paths.ts:8`
- **`makeMediaSubpath`** (Function) — `src/lib/fs/media-writer.ts:5`
- **`writeMediaToPublic`** (Function) — `src/lib/fs/media-writer.ts:33`

## Key Symbols

| Symbol                | Type     | File                         | Line |
| --------------------- | -------- | ---------------------------- | ---- |
| `writePostAtomically` | Function | `src/lib/fs/post-writer.ts`  | 13   |
| `resolveSafe`         | Function | `src/lib/fs/paths.ts`        | 8    |
| `makeMediaSubpath`    | Function | `src/lib/fs/media-writer.ts` | 5    |
| `writeMediaToPublic`  | Function | `src/lib/fs/media-writer.ts` | 33   |
| `safeBaseName`        | Function | `src/lib/fs/media-writer.ts` | 11   |
| `exists`              | Function | `src/lib/fs/media-writer.ts` | 19   |

## How to Explore

1. `gitnexus_context({name: "writePostAtomically"})` — see callers and callees
2. `gitnexus_query({query: "fs"})` — find related execution flows
3. Read key files listed above for implementation details
