---
name: admin
description: "Skill for the Admin area of astro-blog. 10 symbols across 4 files."
---

# Admin

10 symbols | 4 files | Cohesion: 100%

## When to Use

- Working with code in `src/`
- Understanding how MediaUploader, handle, FrontmatterForm work
- Modifying admin-related functionality

## Key Files

| File                                       | Symbols                             |
| ------------------------------------------ | ----------------------------------- |
| `src/components/admin/TagInput.tsx`        | TagInput, remove, commit, onKeyDown |
| `src/components/admin/MediaUploader.tsx`   | MediaUploader, handle               |
| `src/components/admin/FrontmatterForm.tsx` | FrontmatterForm, set                |
| `src/components/admin/RevisionList.tsx`    | RevisionList, restore               |

## Entry Points

Start here when exploring this area:

- **`MediaUploader`** (Function) — `src/components/admin/MediaUploader.tsx:7`
- **`handle`** (Function) — `src/components/admin/MediaUploader.tsx:12`
- **`FrontmatterForm`** (Function) — `src/components/admin/FrontmatterForm.tsx:20`
- **`set`** (Function) — `src/components/admin/FrontmatterForm.tsx:21`
- **`TagInput`** (Function) — `src/components/admin/TagInput.tsx:7`

## Key Symbols

| Symbol            | Type     | File                                       | Line |
| ----------------- | -------- | ------------------------------------------ | ---- |
| `MediaUploader`   | Function | `src/components/admin/MediaUploader.tsx`   | 7    |
| `handle`          | Function | `src/components/admin/MediaUploader.tsx`   | 12   |
| `FrontmatterForm` | Function | `src/components/admin/FrontmatterForm.tsx` | 20   |
| `set`             | Function | `src/components/admin/FrontmatterForm.tsx` | 21   |
| `TagInput`        | Function | `src/components/admin/TagInput.tsx`        | 7    |
| `remove`          | Function | `src/components/admin/TagInput.tsx`        | 21   |
| `commit`          | Function | `src/components/admin/TagInput.tsx`        | 10   |
| `onKeyDown`       | Function | `src/components/admin/TagInput.tsx`        | 25   |
| `RevisionList`    | Function | `src/components/admin/RevisionList.tsx`    | 17   |
| `restore`         | Function | `src/components/admin/RevisionList.tsx`    | 25   |

## Execution Flows

| Flow                  | Type            | Steps |
| --------------------- | --------------- | ----- |
| `MediaUploader → Set` | intra_community | 3     |

## How to Explore

1. `gitnexus_context({name: "MediaUploader"})` — see callers and callees
2. `gitnexus_query({query: "admin"})` — find related execution flows
3. Read key files listed above for implementation details
