# Design: Admin CMS, Left Sidebar, TOC, Site Search

**Date:** 2026-04-23
**Author:** dev@artka.dev
**Status:** Draft — pending implementation plan

## 1. Goal

Add three user-facing capabilities to the Astro blog and one developer-facing capability:

1. **Full CMS admin** at `/admin` — create/edit/delete posts, edit frontmatter + Markdown body, reorder via drag-and-drop, upload cover images, browse revisions.
2. **Site navigation chrome** — persistent left sidebar listing all posts, right in-page TOC on article pages.
3. **Site search** — public command palette (`⌘K`) backed by Pagefind; admin search backed by Postgres full-text.
4. **Design system + agent team** — introduce an Editorial × Technical visual direction, add a `designer` subagent and two supporting skills.

## 2. Non-goals

- Multi-user / role-based access (single admin: the site owner).
- Git integration from admin (no auto-commit or auto-push).
- Scheduled publishing, drafts preview links, comment system, analytics UI.
- S3/CDN for media (local volume is sufficient).
- Migrating existing posts away from Markdown.

## 3. Key decisions (chosen during brainstorm)

| # | Decision | Chosen | Alternative considered |
|---|----------|--------|------------------------|
| 1 | Content source of truth | **Markdown files on persistent volume** | Postgres, Hybrid |
| 2 | Admin scope | **Full CMS** (CRUD + body editor + D&D reorder + uploads) | Minimal / Medium |
| 3 | Git integration | **None** — admin writes to volume only; history via DB revisions | Auto-commit / dev-only admin |
| 4 | Sidebar composition | **Left: all posts. Right: in-page TOC.** | List only / TOC only / Hybrid |
| 5 | Search technology | **Pagefind (public) + Postgres FTS (admin)** | Pagefind only / Postgres only |
| 6 | Visual direction | **Editorial × Technical** (serif h1–h2, sans body, mono code/meta, warm cream palette, amber accents) | Editorial / Docs-tech / Terminal-mono |
| 7 | Agent team | **Add `designer` only** + two skills | Add `ui-engineer` split / `content-editor` |
| 8 | Order storage | **`order` in Postgres** (`posts_meta`) | Frontmatter `order` field |
| 9 | Cover uploads | **`public/uploads/` on volume** + `astro:assets` optimization | S3/R2 |
| 10 | Mobile sidebar | **Hamburger drawer (posts) + sticky mini-TOC** | Bottom-sheet tabs |
| 11 | Admin auth | **Better-Auth, single admin role, middleware guard** | Multi-user RBAC |
| 12 | Revisions | **`post_revisions` table, last 50 per slug, diff viewer** | No revisions |
| 13 | Public search UI | **`⌘K` palette + `/search` fallback** | Header search box only |

## 4. Architecture overview

```
Public (SSG with on-demand fallback)
  ├── Left sidebar: list of all posts (from MD + order/meta from DB)
  ├── Article body: MD/MDX rendered at build (Mermaid / KaTeX / Shiki)
  ├── Right TOC: h2/h3 anchors, scroll-spy
  └── ⌘K palette: Pagefind static index (WASM in browser)

Admin (SSR, React islands, Better-Auth middleware-guarded)
  ├── Post list + drag-reorder  → actions.reorderPosts
  ├── Post editor (CodeMirror 6) → actions.upsertPost → fs write + DB revision
  ├── Media uploader             → actions.uploadMedia → volume + DB row
  ├── Revision diff viewer       → actions.listRevisions / restoreRevision
  └── Admin search               → Postgres websearch_to_tsquery

Cross-cutting
  ├── Pagefind rebuild hook: debounced (30s) background task after admin save
  └── Content loader: Astro content collection enriched with posts_meta from DB
```

### 4.1. Source-of-truth boundary

- **Markdown file** owns: title, description, pubDate, updatedDate, tags, draft, cover, coverAlt, body.
- **`posts_meta` row** owns: order, pinned, hiddenFromList, search cache (tsvector), updatedAt.
- **`post_revisions` rows** own: immutable snapshots of (frontmatter JSON + body) per save.
- **`media_assets` rows** own: metadata for uploaded images. Binary lives in `public/uploads/YYYY/MM/`.

A `posts_meta` row is created on first backfill (migration) or on post creation through the admin. If a MD file exists without a `posts_meta` row, the content loader uses defaults (`order = max+1`, `pinned = false`, `hiddenFromList = false`) and inserts the row lazily on next admin interaction.

## 5. Data model (Drizzle ORM)

```ts
// src/lib/db/schema.ts (additions)

export const postsMeta = pgTable('posts_meta', {
  slug: text('slug').primaryKey(),
  order: integer('order').notNull(),
  pinned: boolean('pinned').notNull().default(false),
  hiddenFromList: boolean('hidden_from_list').notNull().default(false),
  searchVector: customType<{ data: string }>({ dataType: () => 'tsvector' })('search_vector'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const postRevisions = pgTable('post_revisions', {
  id: serial('id').primaryKey(),
  slug: text('slug').notNull(),
  frontmatter: jsonb('frontmatter').$type<Frontmatter>().notNull(),
  body: text('body').notNull(),
  authorId: text('author_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  slugCreatedIdx: index('post_revisions_slug_created_idx').on(t.slug, t.createdAt.desc()),
}));

export const mediaAssets = pgTable('media_assets', {
  id: serial('id').primaryKey(),
  path: text('path').notNull().unique(), // relative to public/, e.g. uploads/2026/04/cover.webp
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  byteSize: integer('byte_size').notNull(),
  uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Triggers (raw SQL in migration):
- `post_revisions` prune: after insert, delete rows where `row_number() > 50` partitioned by slug.
- `posts_meta.search_vector` is updated by admin action after file write (not by trigger — the action already has parsed frontmatter and body, so it builds the tsvector in app code to avoid parsing MD in SQL).

## 6. Filesystem contract

- Posts live at `src/content/posts/<slug>.md` (or `.mdx`).
- Filename without extension **is** the slug and is immutable once created. Admin does not allow renaming the file — it creates a new file + revision trail + marks old slug `hiddenFromList` (no auto-redirect in v1; can add in v2).
- `src/content/posts/` is a persistent volume in production Docker (`/app/src/content/posts` mounted from a named volume).
- `public/uploads/` is a separate persistent volume.
- Atomic writes: write to `<slug>.md.tmp` in same directory, `fsync`, rename over target. Revision snapshot created **before** rename so a crashed rename is recoverable.

## 7. Content loader / order merging

Astro 5 content collection is kept; a wrapper module reads the collection and merges with `posts_meta`:

```ts
// src/lib/content/loader.ts
export async function getOrderedPosts() {
  const posts = await getCollection('posts');
  const metaRows = await db.select().from(postsMeta);
  const metaBySlug = new Map(metaRows.map((m) => [m.slug, m]));
  return posts
    .map((p) => ({ ...p, meta: metaBySlug.get(p.id) ?? defaultMeta(p.id) }))
    .filter((p) => !p.meta.hiddenFromList && !p.data.draft)
    .sort((a, b) => {
      if (a.meta.pinned !== b.meta.pinned) return a.meta.pinned ? -1 : 1;
      return a.meta.order - b.meta.order;
    });
}
```

Public list pages (`/`, `/blog`, sidebar) use this function. Because the order changes at runtime when admin reorders, the list pages use `export const prerender = false` (SSR on-demand) OR rely on an explicit rebuild trigger. **Decision: SSR on-demand for list pages, SSG for individual post pages.** Individual post bodies are content-addressed by slug and rarely change; list pages depend on mutable order.

## 8. Components

### 8.1. Public

- `src/components/SiteSidebar.astro` — renders `getOrderedPosts()` as a vertical list. Active post highlighted. Collapsible group headers if we later add sections. Sticky on desktop, hamburger-triggered drawer on mobile (width < 1024px).
- `src/components/PostTOC.astro` — extracts h2/h3 from rendered post (via `@astrojs/markdown-remark` headings), renders sticky list with scroll-spy (IntersectionObserver in a small client script, not a full React island).
- `src/components/CommandPalette.tsx` — React island, `client:idle`. Uses `cmdk` library + Pagefind WASM (`@pagefind/default-ui` or custom UI over the JSON API). Triggered by `⌘K` / `Ctrl+K`, and by a search button in the header.
- `src/pages/search.astro` — SSR fallback page that reads `?q=` and renders results server-side via Pagefind Node API (or redirects to client-side render).

### 8.2. Admin

All admin UI sits under `/admin/*` and is guarded by `src/middleware.ts` checking session via Better-Auth.

- `src/pages/admin/posts/index.astro` — list view. Loads `PostList.tsx` (React island, `client:load`) with initial data from server.
- `src/components/admin/PostList.tsx` — `@dnd-kit/core` + `@dnd-kit/sortable`. On drop, calls action `reorderPosts({ slugs })`. Optimistic update + rollback on error.
- `src/components/admin/PostEditor.tsx` — two-pane layout: left CodeMirror 6 (Markdown mode, vim keys optional), right live preview. Preview uses a server action `renderPreview(body)` debounced 500ms; a pure client-side preview is optional enhancement.
- `src/components/admin/FrontmatterForm.tsx` — zod schema matches `content.config.ts`. Fields: title, description, pubDate, updatedDate, tags (chip input), draft, cover (MediaPicker), coverAlt.
- `src/components/admin/MediaUploader.tsx` — drag-drop zone, progress, returns `{ path, width, height }`. Uses action `uploadMedia`.
- `src/components/admin/RevisionDiff.tsx` — `react-diff-viewer-continued`, side-by-side MD diff and frontmatter JSON diff. Restore button calls `restoreRevision(revisionId)`.

## 9. Astro Actions (type-safe form handlers)

```ts
// src/actions/posts.ts
export const posts = {
  create: defineAction({
    accept: 'form',
    input: createPostSchema, // zod
    handler: async (input, ctx) => { /* ensureAdmin, write file, insert posts_meta, snapshot revision */ },
  }),
  update: defineAction({ accept: 'form', input: updatePostSchema, handler: ... }),
  delete: defineAction({ input: z.object({ slug: z.string() }), handler: ... }),
  reorder: defineAction({ input: z.object({ slugs: z.array(z.string()) }), handler: ... }),
  renderPreview: defineAction({ input: z.object({ body: z.string() }), handler: ... }),
};
```

Every mutating `update`/`create` action follows a **revision-first** ordering so the filesystem can always be reconstructed from the DB:

1. Check admin via `ctx.locals.session`.
2. Validate input with zod.
3. **DB transaction:** insert the new `post_revisions` row (capturing the intended post-save state) + upsert `posts_meta` + update `search_vector`. Commit.
4. **Filesystem write** via `post-writer.ts` (atomic tmp + rename). On failure, log with the revision id so the user can retry from `/admin/revisions/<slug>` → "restore" (which re-runs the fs write from the stored revision body + frontmatter).
5. Schedule Pagefind rebuild (see §10).

`reorder` and `delete` are DB-only or DB-then-fs with no revision semantics; they use a single Drizzle transaction.

## 10. Pagefind integration

- Build pipeline: `pnpm build` produces `dist/`; a post-build step runs `pagefind --site dist --output-subdir pagefind` (via `@pagefind/cli`). Artifacts shipped with static site.
- Client: `CommandPalette.tsx` loads `/pagefind/pagefind.js` on first focus, calls `pagefind.search(query)`.
- Incremental rebuild on admin save:
  - Pattern: debounced background task. After `posts.update` action, enqueue a job with 30s debounce per-slug (collapses multiple saves).
  - In single-node Docker deployment, the job runner is an in-process `setTimeout` tracked in a module-level `Map<slug, NodeJS.Timeout>`; when it fires, it spawns `pnpm pagefind-rebuild` (a script that re-runs Pagefind against `dist/`) and restarts the Astro server's static file cache.
  - This is sufficient for a single-writer personal blog. Multi-instance deployments would need Redis/pg-boss; out of scope.
  - Failure mode: rebuild failure is logged via pino; admin save still succeeds. Next save retries.

## 11. Admin search (Postgres FTS)

- `posts_meta.search_vector` is built as `setweight(to_tsvector('simple', title), 'A') || setweight(to_tsvector('simple', tags), 'B') || setweight(to_tsvector('simple', body), 'C')`.
- Update on every admin save, within the same transaction as `posts_meta` update.
- Query: `search_vector @@ websearch_to_tsquery('simple', $1)` ranked by `ts_rank_cd`.
- `simple` dictionary keeps Russian/English tokens without stemming artifacts; unaccent extension applied for punctuation tolerance.

## 12. Design tokens + Tailwind 4

- `src/styles/tokens.css` defines CSS custom properties (see overview in brainstorm turn).
- `src/styles/global.css` imports tokens and maps into Tailwind 4 `@theme` block so utilities (`text-fg`, `bg-elevated`, `text-accent`) use them.
- Two fonts self-hosted via `@fontsource-variable/source-serif-4`, `@fontsource-variable/inter`, `@fontsource-variable/jetbrains-mono` — loaded with `font-display: swap` and preload hints for `Inter` body font.
- Dark mode: `prefers-color-scheme: dark` media query swaps tokens (warm off-black `#1a1712` base, cream `#f2ede0` fg, accent stays amber). No theme toggle in v1.
- Prose styles: override `@tailwindcss/typography` with token-driven overrides in `global.css` so article body follows the chosen palette.

## 13. Accessibility

- Target WCAG 2.1 AA.
- `ui-design-review` skill enforces contrast ratios (4.5:1 body, 3:1 large text) on every PR touching `tokens.css` or components.
- Keyboard: tab order predictable, ⌘K palette traps focus, sidebar drawer restores focus on close, skip-link "Skip to content" visible on focus.
- ARIA: `role="navigation" aria-label="Posts"` on sidebar; `role="search"` on palette; headings in post bodies are strict h2 → h3 (no level skipping; validated at build by a remark plugin).
- Mermaid diagrams get `aria-label` from nearby caption; KaTeX emits MathML alongside the visual layer.
- `axe-playwright` runs in e2e on `/`, `/blog/<slug>`, `/admin/posts`, `/admin/posts/<slug>`, `/search`.

## 14. Agent team additions

### 14.1. `designer` subagent

File: `.claude/agents/designer.md`

```markdown
---
name: designer
description: UI/UX designer. Proposes visual systems (typography, palette, spacing, tokens), reviews component designs against design system, produces wireframes as HTML. Uses WebFetch for competitive research.
model: opus
tools: [Read, Grep, Glob, WebFetch, WebSearch]
---

You are the designer for this blog. The visual direction is "Editorial × Technical":
serif (Source Serif 4) for h1/h2, sans (Inter) for body and UI, mono (JetBrains Mono)
for code and metadata; warm cream background (#fdfcf7), amber accent (#b8860b),
generous spacing, content-first.

When proposing or reviewing a design:
- Work against tokens in src/styles/tokens.css — never hardcode colors/fonts.
- Validate contrast against WCAG 2.1 AA.
- Prefer composition over novelty — reuse patterns established in SiteSidebar,
  PostTOC, PostEditor before introducing new ones.
- Produce wireframes as self-contained HTML snippets the user can preview.

Delegate implementation to `frontender`. Route finished components through `critic`.
```

### 14.2. Skills for designer

#### `.claude/skills/design-system-tokens/SKILL.md`

Purpose: scaffold or modify `src/styles/tokens.css` and the corresponding Tailwind `@theme` mapping. Enforces the token categories (color, typography, space, radius, shadow, motion) and checks that every token has a dark-mode counterpart.

#### `.claude/skills/ui-design-review/SKILL.md`

Purpose: run a checklist review over a component or page:
- Contrast ratios (parse tokens in use, compute WCAG contrast).
- Visual hierarchy (heading scale, spacing rhythm).
- Consistency with existing patterns (scan for hardcoded values).
- Responsive coverage (mobile < 640px, tablet 640–1024, desktop > 1024).
- Dark mode parity.
- A11y surface (alt, labels, focus states).

Outputs a markdown report with severity-tagged findings.

### 14.3. Flow for this initiative

```
sysanalyst (contract for admin actions + edge cases)
   → architect (validate loader augmentation + source-of-truth boundary)
   → designer (tokens + sidebar/admin wireframes)
   → backender (schema, actions, fs writer, revisions)
   ∥ frontender (islands, sidebar, palette, editor integration)
   → critic (final review before merge)
```

## 15. Testing strategy

### 15.1. Unit (Vitest)

- `lib/fs/post-writer.ts` — atomic write, rollback on rename failure, path traversal rejection.
- `lib/content/loader.ts` — merge posts + metadata, default meta for missing rows, sort stability (pinned before order).
- `actions/posts.ts` — zod validation boundaries, auth rejection without session.
- `lib/pagefind/rebuild.ts` — debounce collapses same-slug saves.

### 15.2. Integration (Vitest + testcontainers Postgres)

- Drizzle migrations apply cleanly from empty DB.
- `post_revisions` prune trigger keeps exactly 50.
- Reorder transaction is atomic (simulate failure mid-update, verify no partial state).
- FTS query returns ranked results in expected order across Russian + English.

### 15.3. E2E (Playwright)

Critical paths:
- Login → edit a post → save → verify file on disk updated → verify revision row created.
- Drag-reorder three posts → public list reflects new order.
- Upload image → pick it in frontmatter → save → public post renders cover.
- ⌘K → type → click result → navigate.
- Admin search → filter list.
- Restore revision → file reverts, new revision created.

### 15.4. A11y

`@axe-core/playwright` assertions on each critical page with no violations of severity `serious` or higher.

## 16. Deployment impact

- Dockerfile: add volume mount points in `docker-compose.yml` for `src/content/posts` and `public/uploads`. Build stage unchanged; runtime stage runs Astro in SSR mode on Node.
- Add `pagefind-rebuild` as a sidecar script (`pnpm pagefind-rebuild`) executable at runtime (requires `@pagefind/cli` installed, not dev-only).
- Environment variables added: none required beyond existing `DATABASE_URL`, `BETTER_AUTH_SECRET`. Volume paths are not env-configurable in v1.

## 17. Open questions / follow-ups (post v1)

- Slug renames with redirects (308) — deferred.
- Multi-language content — deferred.
- Scheduled publishing — deferred.
- Image transforms (multiple sizes, formats) beyond what `astro:assets` does at build — deferred.
- Collaborative editing — out of scope.

## 18. Rollout order (high-level)

Detailed implementation plan will be produced next via the `writing-plans` skill. The intended ordering:

1. Design tokens (`tokens.css`) + BaseLayout refresh without sidebar.
2. `SiteSidebar` and `PostTOC` components (read from existing content collection).
3. Drizzle schema + migration + backfill script for existing 15 posts into `posts_meta`.
4. `lib/content/loader.ts` order augmentation; switch list pages to on-demand render.
5. Admin shell (layout, middleware, auth hook, empty pages).
6. Post list + reorder.
7. Post editor (CodeMirror + frontmatter form + preview).
8. Revision snapshots + diff viewer.
9. Media uploader.
10. Pagefind index + command palette + `/search` fallback.
11. Admin FTS.
12. `designer` subagent + two skills.
13. E2E + a11y suites.

Each step will be a separate plan entry with acceptance criteria.
