---
name: admin
description: "Skill for the Admin area of astro-blog. 10 symbols across 4 files."
---

# Admin

10 symbols | 4 files | Cohesion: 100%

## When to Use

Invoke this skill when the task matches one of these patterns:

- **Post frontmatter form** — adding a new field to `FrontmatterForm.tsx`, changing validation, or syncing the form with the Zod schema in `src/content.config.ts`.
- **Media upload UI** — bug or feature work in `MediaUploader.tsx` (drag-and-drop, progress, size/type limits). The server-side counterpart lives in the `fs` skill (`writeMediaToPublic`).
- **Tag input** — behaviour of `TagInput.tsx`: comma/Enter commit, removal, deduplication.
- **Revision history UI** — post revision list via `RevisionList.tsx`, restore-previous-version flow.

**Do NOT invoke** for server-side actions (use `backender`), for `/admin/*` routing or middleware (`frontender` + middleware), or for the post content itself (`content` skill).

## Key Files

| File                                       | Symbols                             |
| ------------------------------------------ | ----------------------------------- |
| `src/components/admin/TagInput.tsx`        | TagInput, remove, commit, onKeyDown |
| `src/components/admin/MediaUploader.tsx`   | MediaUploader, handle               |
| `src/components/admin/FrontmatterForm.tsx` | FrontmatterForm, set                |
| `src/components/admin/RevisionList.tsx`    | RevisionList, restore               |

## Entry Points

Start here when exploring this area:

- **`MediaUploader`** (Function) — `src/components/admin/MediaUploader.tsx`
- **`handle`** (Function) — `src/components/admin/MediaUploader.tsx`
- **`FrontmatterForm`** (Function) — `src/components/admin/FrontmatterForm.tsx`
- **`set`** (Function) — `src/components/admin/FrontmatterForm.tsx`
- **`TagInput`** (Function) — `src/components/admin/TagInput.tsx`

## Key Symbols

Line numbers are omitted on purpose — they go stale; locate symbols with Grep or `gitnexus_context`.

| Symbol            | Type     | File                                       |
| ----------------- | -------- | ------------------------------------------ |
| `MediaUploader`   | Function | `src/components/admin/MediaUploader.tsx`   |
| `handle`          | Function | `src/components/admin/MediaUploader.tsx`   |
| `FrontmatterForm` | Function | `src/components/admin/FrontmatterForm.tsx` |
| `set`             | Function | `src/components/admin/FrontmatterForm.tsx` |
| `TagInput`        | Function | `src/components/admin/TagInput.tsx`        |
| `remove`          | Function | `src/components/admin/TagInput.tsx`        |
| `commit`          | Function | `src/components/admin/TagInput.tsx`        |
| `onKeyDown`       | Function | `src/components/admin/TagInput.tsx`        |
| `RevisionList`    | Function | `src/components/admin/RevisionList.tsx`    |
| `restore`         | Function | `src/components/admin/RevisionList.tsx`    |

## Execution Flows

| Flow                  | Type            | Steps |
| --------------------- | --------------- | ----- |
| `MediaUploader → Set` | intra_community | 3     |

## How to Explore

1. `gitnexus_context({name: "MediaUploader"})` — see callers and callees
2. `gitnexus_query({query: "admin"})` — find related execution flows
3. Read key files listed above for implementation details
