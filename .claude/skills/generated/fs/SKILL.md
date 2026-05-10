---
name: fs
description: "Skill for the Fs area of astro-blog. 6 symbols across 3 files."
---

# Fs

6 symbols | 3 files | Cohesion: 100%

## When to Use

Invoke this skill when the task matches one of these patterns:

- **Writing a post to disk** — `writePostAtomically`. Any change to the write algorithm (atomicity via `tmp + rename`, encoding, permissions) belongs here. Never write to `src/content/posts/` through a direct `fs.writeFile`.
- **Media uploads to `/public`** — `writeMediaToPublic`, `makeMediaSubpath`, `safeBaseName`, `exists`. The server side of `MediaUploader` (its UI lives in the `admin` skill).
- **Path safety** — `resolveSafe` against path traversal. Every endpoint that accepts a filename from user input must go through it.

**Do NOT invoke** for frontmatter work (use `content` — `parseFrontmatter` / `serializeFrontmatter`), for DB operations, or for downloading external files (those belong to API routes).

**Fail-loud reminder:** if a write is not atomic (no `.tmp` + `rename`), do not mask it as "working" — flag the risk of a partially written file explicitly.

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
