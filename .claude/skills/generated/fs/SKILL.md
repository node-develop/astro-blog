---
name: fs
description: "Skill for the Fs area of astro-blog. 6 symbols across 3 files."
---

# Fs

6 symbols | 3 files | Cohesion: 100%

## When to Use

Invoke this skill when the task matches one of these patterns:

- **Writing a post to disk** — `writePostAtomically`. Any change to the write algorithm (atomicity via `tmp + rename`, encoding, permissions) belongs here. Never write to `src/content/posts/` through a direct `fs.writeFile`.
- **Media uploads** — `writeMediaToPublic`, `makeMediaSubpath`, `safeBaseName`, `exists`. The server side of `MediaUploader` (its UI lives in the `admin` skill). Target directory is `UPLOADS_DIR` from `src/lib/fs/paths.ts`: `public/uploads` in dev, `/app/dist/client/uploads` in the Docker runner (env `UPLOADS_DIR`, persistent volume — see `docs/runbooks/dokploy-uploads-volume.md`).
- **Path safety** — `resolveSafe` against path traversal. Every endpoint that accepts a filename from user input must go through it. `POSTS_DIR` / `SITE_DIR` / `UPLOADS_DIR` constants live in `src/lib/fs/paths.ts`.

**Do NOT invoke** for frontmatter work (use `content` — `parseFrontmatter` / `serializeFrontmatter`), for DB operations, or for downloading external files (those belong to API routes).

**Fail-loud reminder:** if a write is not atomic (no `.tmp` + `rename`), do not mask it as "working" — flag the risk of a partially written file explicitly.

## Key Files

| File                         | Symbols                                                    |
| ---------------------------- | ---------------------------------------------------------- |
| `src/lib/fs/media-writer.ts` | makeMediaSubpath, safeBaseName, exists, writeMediaToPublic |
| `src/lib/fs/post-writer.ts`  | writePostAtomically                                        |
| `src/lib/fs/paths.ts`        | resolveSafe, POSTS_DIR, SITE_DIR, UPLOADS_DIR              |

## Entry Points

Start here when exploring this area:

- **`writePostAtomically`** (Function) — `src/lib/fs/post-writer.ts`
- **`resolveSafe`** (Function) — `src/lib/fs/paths.ts`
- **`makeMediaSubpath`** (Function) — `src/lib/fs/media-writer.ts`
- **`writeMediaToPublic`** (Function) — `src/lib/fs/media-writer.ts`

## Key Symbols

Line numbers are omitted on purpose — they go stale; locate symbols with Grep or `gitnexus_context`.

| Symbol                | Type     | File                         |
| --------------------- | -------- | ---------------------------- |
| `writePostAtomically` | Function | `src/lib/fs/post-writer.ts`  |
| `resolveSafe`         | Function | `src/lib/fs/paths.ts`        |
| `makeMediaSubpath`    | Function | `src/lib/fs/media-writer.ts` |
| `writeMediaToPublic`  | Function | `src/lib/fs/media-writer.ts` |
| `safeBaseName`        | Function | `src/lib/fs/media-writer.ts` |
| `exists`              | Function | `src/lib/fs/media-writer.ts` |

## How to Explore

1. `gitnexus_context({name: "writePostAtomically"})` — see callers and callees
2. `gitnexus_query({query: "fs"})` — find related execution flows
3. Read key files listed above for implementation details
