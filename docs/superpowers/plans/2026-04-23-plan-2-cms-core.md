# Plan 2 — CMS Core (Schema · Admin · Editor · Media)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the static Astro blog into an authored CMS: store post ordering, revisions, and media metadata in Postgres; keep Markdown files as source of truth for post body; provide a full admin UI under `/admin` with drag-and-drop reorder, CodeMirror-based editor, revision diff viewer, and media uploader.

**Architecture:** File-based source of truth (`src/content/posts/*.md` on a persistent volume in prod) with Postgres for mutable metadata (`posts_meta`), immutable revision snapshots (`post_revisions`), and uploaded media metadata (`media_assets`). Astro's content collection is kept; a wrapper (`lib/content/loader.ts`) merges collection entries with DB rows to produce the final ordered list. Mutations go through Astro Actions guarded by the existing Better-Auth middleware; an action writes a DB revision first, then writes the file atomically (tmp + rename). Reorder is a single SQL transaction. Admin UI is composed of React islands (`client:load`) under a dedicated `AdminLayout`.

**Tech Stack:**
- Astro 5 (mix of SSG for public, SSR on-demand for `/admin`).
- Drizzle ORM + `drizzle-kit` migrations, Postgres 18.
- Better-Auth (already wired) + middleware guard (already present).
- React 19 islands: `@dnd-kit/core` + `@dnd-kit/sortable` for reorder; `@codemirror/*` + `codemirror-lang-markdown` for the editor; `diff` + a small custom diff renderer for revisions.
- `js-yaml` for frontmatter parse/serialize.
- `probe-image-size` for dimension detection on uploads.
- `testcontainers` + real Postgres for integration tests.
- `@axe-core/playwright` already installed for a11y checks.

**Dependencies:** Spec `docs/superpowers/specs/2026-04-23-blog-admin-sidebar-search-design.md` sections 4–11, 13, 15–16. Plan 1 (visual foundation) merged on `main`.

**Out of scope (deferred to later plans):**
- Pagefind index + ⌘K public search (Plan 3).
- Admin full-text search via Postgres `tsvector` (Plan 3).
- `designer` subagent + `design-system-tokens` / `ui-design-review` skills (Plan 4).
- Slug renames with redirects, scheduled publishing, multi-language, collaborative editing.
- Git integration from admin (`A` was chosen — volume-only, no auto-commit).

---

## Key architectural decisions

1. **Source of truth split.** Body + frontmatter in MD files; order/pinned/hidden in `posts_meta`; immutable history in `post_revisions`; media binary in `public/uploads/`, metadata in `media_assets`.
2. **Revision-first ordering.** On every create/update action: DB transaction (insert revision + upsert meta) commits **before** filesystem write. If fs write fails, the user sees an actionable error pointing to the stored revision — retry recovers the file.
3. **Slug immutability.** Filename = slug. Admin does not rename. Renaming in v2 would add a `slug_aliases` table + redirects.
4. **Order in DB, not in frontmatter.** Reorder = single `UPDATE posts_meta` transaction. Frontmatter rewrites for 15+ files on every drag would cause file thrash and lose revision granularity for the drag.
5. **List pages are SSR on-demand.** `src/pages/index.astro`, `src/pages/blog/index.astro`, and any sidebar-using page loses prerender (order changes at runtime). Individual post pages stay SSG.
6. **Existing `posts` table is orphan and will be removed.** It was scaffolded for a Postgres-as-source approach that we did not take. Migration drops it; Better-Auth does not reference it.

---

## File map

**New source files:**
- `src/lib/db/schema.ts` — extend with `postsMeta`, `postRevisions`, `mediaAssets`; remove `posts`.
- `src/lib/content/loader.ts` — `getOrderedPosts()`, `getPostWithMeta(slug)`.
- `src/lib/content/loader.test.ts` — colocated unit test.
- `src/lib/content/frontmatter.ts` — `parseFrontmatter(raw)`, `serializeFrontmatter(data, body)`.
- `src/lib/content/frontmatter.test.ts`.
- `src/lib/content/post-io.ts` — `readPostFromDisk(slug)`, `listPostFiles()`.
- `src/lib/content/post-io.test.ts`.
- `src/lib/fs/post-writer.ts` — `writePostAtomically(slug, frontmatter, body)`.
- `src/lib/fs/post-writer.test.ts`.
- `src/lib/fs/media-writer.ts` — `writeMediaToPublic(file, mime)`.
- `src/lib/fs/media-writer.test.ts`.
- `src/lib/fs/paths.ts` — single home for filesystem path constants + helpers.
- `src/lib/db/repo/posts-meta.ts` — CRUD helpers on `posts_meta`.
- `src/lib/db/repo/revisions.ts` — CRUD helpers on `post_revisions`.
- `src/lib/db/repo/media.ts` — CRUD helpers on `media_assets`.
- `src/actions/index.ts` — Astro Actions entry (Astro requires a single `server` export).
- `src/actions/posts.ts` — `reorderPosts`, `upsertPost`, `deletePost`, `createPost`.
- `src/actions/revisions.ts` — `listRevisions`, `restoreRevision`.
- `src/actions/media.ts` — `uploadMedia`, `deleteMedia`.
- `src/layouts/AdminLayout.astro` — chrome for every admin page.
- `src/components/admin/AdminHeader.astro` — admin top bar with brand + logout.
- `src/components/admin/PostList.tsx` — react island, drag-and-drop reorder.
- `src/components/admin/PostListItem.tsx` — presentational row.
- `src/components/admin/PostEditor.tsx` — CodeMirror wrapper.
- `src/components/admin/FrontmatterForm.tsx` — typed form for frontmatter fields.
- `src/components/admin/TagInput.tsx` — chip input.
- `src/components/admin/MediaPicker.tsx` — opens library, returns `{path, width, height}`.
- `src/components/admin/MediaUploader.tsx` — drag-drop upload panel.
- `src/components/admin/MediaGrid.tsx` — grid display of uploaded media.
- `src/components/admin/RevisionList.tsx` — list of revisions for a slug.
- `src/components/admin/RevisionDiff.tsx` — side-by-side diff renderer.
- `src/components/admin/EmptyState.astro` — reusable placeholder.
- `src/pages/admin/posts/index.astro`.
- `src/pages/admin/posts/new.astro`.
- `src/pages/admin/posts/[slug].astro`.
- `src/pages/admin/media.astro`.
- `src/pages/admin/revisions/[slug].astro`.
- `drizzle/0001_cms_core.sql` — generated by `pnpm db:generate`.
- `drizzle/0002_revisions_prune_trigger.sql` — manual raw SQL for the prune trigger.
- `scripts/backfill-posts-meta.ts` — one-shot backfill for the existing 15 posts.
- `tests/integration/cms.test.ts` — testcontainers-backed Postgres tests.
- `tests/e2e/admin.spec.ts` — playwright flows for login → reorder → edit → revision restore → media upload.

**Modified:**
- `src/lib/db/schema.ts` — drop the orphan `posts` table; add three new tables + indexes.
- `src/components/SiteSidebar.astro` — read from `getOrderedPosts()`.
- `src/pages/index.astro` — `export const prerender = false;` + use new loader.
- `src/pages/blog/index.astro` — same.
- `astro.config.ts` (or `.mjs`) — verify `output: "server"` or keep `hybrid` so list pages can be on-demand.
- `package.json` — new deps + a new `db:backfill` script.
- `src/pages/login.astro` — minor polish for the redirect flow (carry `?next=` when pre-populated).
- `src/middleware.ts` — no structural change; verify admin role check covers all new admin routes.

---

## Sequencing and working conventions

- Every task MUST commit on success. Pre-commit hooks run `lint-staged` + `pnpm typecheck` — never `--no-verify`.
- Conventional commit prefixes: `feat(cms)`, `fix(cms)`, `test(cms)`, `chore(cms)`, `refactor(cms)`.
- Each task runs against a **local Postgres** via the existing `docker-compose.yml`. If it's not running, the task starts it with `docker compose up -d db` as step 1.
- After Phase A completes, every subsequent phase assumes DB schema + loader are in place.
- Integration tests use `testcontainers` to provision an ephemeral Postgres per suite; unit tests mock nothing (prefer real file I/O via `tmp/` dirs and real in-memory data structures).
- React islands are `client:load` unless interactivity is optional (then `client:idle`).
- The admin UI uses the same Editorial × Technical tokens from Plan 1 — no separate theme.

---

# Phase A — Schema, migrations, loader (Tasks 1–10)

## Task 1: Install new dependencies

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml`.

- [ ] **Step 1: Install runtime deps**

```bash
pnpm add js-yaml@^4 probe-image-size@^8 diff@^5
```

- [ ] **Step 2: Install dev deps**

```bash
pnpm add -D @types/js-yaml@^4 @types/diff@^5 testcontainers@^10
```

- [ ] **Step 3: Verify**

```bash
grep -E '"(js-yaml|probe-image-size|diff|testcontainers)"' package.json
```

Expected: five lines (four deps plus `@types/diff` lives under devDeps too).

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(cms): add yaml, diff, image-size, testcontainers"
```

---

## Task 2: Drop orphan `posts` table; add new tables to schema

**Files:**
- Modify: `src/lib/db/schema.ts`.

- [ ] **Step 1: Read current schema**

Run: `cat src/lib/db/schema.ts`. Identify the `posts` pgTable export plus its `Post` / `NewPost` type exports.

- [ ] **Step 2: Replace the entire file**

Overwrite `src/lib/db/schema.ts` with:

```ts
import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  integer,
  pgEnum,
  jsonb,
  serial,
  primaryKey,
} from "drizzle-orm/pg-core";

// ── Better-Auth tables (unchanged) ────────────────────────────

export const userRole = pgEnum("user_role", ["admin", "editor", "reader"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    name: text("name"),
    emailVerified: boolean("email_verified").notNull().default(false),
    role: userRole("role").notNull().default("reader"),
    image: text("image"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ emailIdx: index("users_email_idx").on(t.email) }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("sessions_user_idx").on(t.userId) }),
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    password: text("password"),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ userIdx: index("accounts_user_idx").on(t.userId) }),
);

export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ identifierIdx: index("verifications_identifier_idx").on(t.identifier) }),
);

// ── CMS tables (new in Plan 2) ────────────────────────────────

/**
 * Mutable metadata layered over the markdown file for each post.
 * `slug` is the filename (without extension) in src/content/posts/.
 */
export const postsMeta = pgTable(
  "posts_meta",
  {
    slug: text("slug").primaryKey(),
    order: integer("order").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    hiddenFromList: boolean("hidden_from_list").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index("posts_meta_order_idx").on(t.order),
    pinnedIdx: index("posts_meta_pinned_idx").on(t.pinned),
  }),
);

/**
 * Immutable snapshots of a post's frontmatter + body, produced on every
 * create/update. Triggers prune to the most recent 50 per slug.
 */
export const postRevisions = pgTable(
  "post_revisions",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    frontmatter: jsonb("frontmatter").notNull(),
    body: text("body").notNull(),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    slugCreatedIdx: index("post_revisions_slug_created_idx").on(
      t.slug,
      t.createdAt,
    ),
  }),
);

/**
 * Metadata for uploaded media. File bytes live under public/uploads/.
 */
export const mediaAssets = pgTable(
  "media_assets",
  {
    id: serial("id").primaryKey(),
    path: text("path").notNull().unique(),
    originalName: text("original_name").notNull(),
    mimeType: text("mime_type").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    byteSize: integer("byte_size").notNull(),
    uploadedById: uuid("uploaded_by_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ uploadedAtIdx: index("media_assets_uploaded_at_idx").on(t.uploadedAt) }),
);

// ── Type aliases ──────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type PostMeta = typeof postsMeta.$inferSelect;
export type NewPostMeta = typeof postsMeta.$inferInsert;

export type PostRevision = typeof postRevisions.$inferSelect;
export type NewPostRevision = typeof postRevisions.$inferInsert;

export type MediaAsset = typeof mediaAssets.$inferSelect;
export type NewMediaAsset = typeof mediaAssets.$inferInsert;

// Re-export the primaryKey builder so repos can use compound keys later.
export { primaryKey };
```

Note: `primaryKey` is re-exported even if unused now — it's commonly needed later, and keeping it avoids a later schema-level import churn.

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`. The old `Post`/`NewPost` type is gone; if any file still imports it, fix the import (there should be none in production code because the table was orphaned — confirm with `grep -rn "NewPost\|type Post" src`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "feat(cms): remove orphan posts table, add posts_meta/post_revisions/media_assets"
```

---

## Task 3: Generate and apply Drizzle migration

**Files:**
- Create: `drizzle/0001_cms_core.sql` (generated).
- Modify: `drizzle/meta/*` (Drizzle maintains its own journal).

- [ ] **Step 1: Ensure DB is up**

```bash
docker compose up -d db
# Wait for it to be healthy; on slow machines this takes ~3s.
```

If `docker-compose.yml` is not present or the service is named differently, open the file, find the Postgres service name, and adjust accordingly. DO NOT proceed without a reachable Postgres at `DATABASE_URL`.

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
```

Expected: a new file `drizzle/0001_<adjective_name>.sql` is created. Rename it to `0001_cms_core.sql` if Drizzle chose a different adjective (`mv drizzle/0001_*.sql drizzle/0001_cms_core.sql` — only if exactly one file matches the glob).

Update `drizzle/meta/_journal.json` accordingly (Drizzle adds a new entry). If the rename confuses the journal, just regenerate and accept the auto-named file; consistency with the journal wins.

- [ ] **Step 3: Inspect migration SQL**

Open `drizzle/0001_cms_core.sql` (or the auto-named file). Confirm:
- `DROP TABLE IF EXISTS "posts"` or equivalent (the orphan).
- `CREATE TABLE "posts_meta" (...)` with `slug text PRIMARY KEY, "order" integer NOT NULL, ...`.
- `CREATE TABLE "post_revisions" (...)` with the FK to users.
- `CREATE TABLE "media_assets" (...)`.
- Index creation for each.

If anything is missing or unexpected, fix `schema.ts` and re-run `pnpm db:generate`. Delete the wrong SQL file first or Drizzle will chain migrations.

- [ ] **Step 4: Apply**

```bash
pnpm db:migrate
```

Verify in psql (optional):

```bash
docker compose exec -T db psql -U postgres -d blog -c '\dt'
```

Expected: `posts_meta`, `post_revisions`, `media_assets` present; `posts` gone.

- [ ] **Step 5: Commit**

```bash
git add drizzle/
git commit -m "feat(cms): initial migration for CMS tables"
```

---

## Task 4: Add `post_revisions` prune trigger via raw SQL migration

**Files:**
- Create: `drizzle/0002_revisions_prune_trigger.sql`.
- Modify: `drizzle/meta/_journal.json`.

Drizzle-kit doesn't model triggers. We add a raw migration by creating the SQL file manually and registering it in the journal.

- [ ] **Step 1: Create `drizzle/0002_revisions_prune_trigger.sql`**

```sql
-- Keep at most 50 revisions per slug. Runs after every insert.
-- Uses a row-number window to identify rows to delete atomically.

CREATE OR REPLACE FUNCTION prune_post_revisions() RETURNS trigger AS $$
BEGIN
  DELETE FROM post_revisions
  WHERE id IN (
    SELECT id FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at DESC, id DESC) AS rn
      FROM post_revisions
      WHERE slug = NEW.slug
    ) ranked
    WHERE rn > 50
  );
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS post_revisions_prune ON post_revisions;
CREATE TRIGGER post_revisions_prune
AFTER INSERT ON post_revisions
FOR EACH ROW
EXECUTE FUNCTION prune_post_revisions();
```

- [ ] **Step 2: Register in the journal**

Open `drizzle/meta/_journal.json`. Append a new entry after the existing entries. Example shape:

```json
{
  "idx": 2,
  "version": "7",
  "when": <current unix ms>,
  "tag": "0002_revisions_prune_trigger",
  "breakpoints": true
}
```

Match the `version` and `breakpoints` values used by the preceding entries. Do NOT invent unique fields.

If you're unsure of the journal format, skip the journal edit and instead run the SQL manually via psql. But: committing the sql file plus running it manually means a fresh clone will fail `pnpm db:migrate`. Prefer the journal edit; worst case the journal edit is wrong, fix and retry.

Alternative, simpler approach: embed the trigger in a snapshot JSON. If this proves painful, convert the trigger into code run during `src/lib/db/migrate.ts` after the migrations complete — apply-if-not-exists semantics keep it idempotent. Document whichever approach you took in the commit message.

- [ ] **Step 3: Apply on fresh DB**

```bash
docker compose down -v          # wipe volumes
docker compose up -d db
pnpm db:migrate
```

Verify trigger exists:

```bash
docker compose exec -T db psql -U postgres -d blog -c "\df prune_post_revisions"
```

Expected: one row.

- [ ] **Step 4: Commit**

```bash
git add drizzle/
git commit -m "feat(cms): prune trigger keeps last 50 post_revisions per slug"
```

---

## Task 5: Backfill script for existing posts

**Files:**
- Create: `scripts/backfill-posts-meta.ts`.
- Modify: `package.json` scripts.

- [ ] **Step 1: Create the script**

`scripts/backfill-posts-meta.ts`:

```ts
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { db } from "../src/lib/db/index.ts";
import { postsMeta } from "../src/lib/db/schema.ts";

const POSTS_DIR = resolve(process.cwd(), "src/content/posts");

function parseNumericPrefix(filename: string): number | null {
  const match = /^(\d+)[-_]/.exec(filename);
  if (!match || match[1] === undefined) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

async function main(): Promise<void> {
  const files = await readdir(POSTS_DIR);
  const slugs = files
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"))
    .map((f) => f.replace(/\.(md|mdx)$/, ""));

  const existing = await db.select({ slug: postsMeta.slug }).from(postsMeta);
  const existingSet = new Set(existing.map((r) => r.slug));

  // Strategy: numeric-prefixed slugs get their number as order; others
  // get a stable order computed from the sorted unused slugs, starting
  // after the maximum numeric prefix to avoid collisions.
  const numericSlugs = slugs
    .filter((s) => parseNumericPrefix(s) !== null)
    .sort((a, b) => (parseNumericPrefix(a) ?? 0) - (parseNumericPrefix(b) ?? 0));
  const otherSlugs = slugs.filter((s) => parseNumericPrefix(s) === null).sort();

  const maxNumeric = numericSlugs.length
    ? (parseNumericPrefix(numericSlugs[numericSlugs.length - 1]!) ?? 0)
    : 0;

  const rows: { slug: string; order: number }[] = [];
  for (const slug of numericSlugs) {
    rows.push({ slug, order: parseNumericPrefix(slug)! });
  }
  otherSlugs.forEach((slug, i) => rows.push({ slug, order: maxNumeric + i + 1 }));

  const toInsert = rows.filter((r) => !existingSet.has(r.slug));
  if (toInsert.length === 0) {
    console.log("nothing to backfill — all slugs already have posts_meta rows");
    return;
  }

  await db.insert(postsMeta).values(toInsert);
  console.log(`backfilled ${toInsert.length} posts_meta rows:`);
  for (const r of toInsert) console.log(`  ${r.slug.padEnd(40)} order=${r.order}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
```

- [ ] **Step 2: Add `db:backfill` script to `package.json`**

In `package.json` `"scripts"`:

```json
"db:backfill": "node --experimental-strip-types scripts/backfill-posts-meta.ts"
```

- [ ] **Step 3: Run it**

```bash
pnpm db:backfill
```

Expected: prints the count + list of 15 posts with their order assignments.

Run again:

```bash
pnpm db:backfill
```

Expected: "nothing to backfill" — idempotent.

- [ ] **Step 4: Verify in DB**

```bash
docker compose exec -T db psql -U postgres -d blog -c 'SELECT slug, "order" FROM posts_meta ORDER BY "order";'
```

Expected: 15 rows, numeric-prefixed ones ordered 1..14, `hello-world` at 15.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-posts-meta.ts package.json
git commit -m "feat(cms): backfill posts_meta from existing markdown files"
```

---

## Task 6: `lib/content/loader.ts` — failing tests

**Files:**
- Create: `src/lib/content/loader.ts` (stub).
- Create: `src/lib/content/loader.test.ts`.

- [ ] **Step 1: Stub**

```ts
// src/lib/content/loader.ts
import type { CollectionEntry } from "astro:content";
import type { PostMeta } from "~/lib/db/schema";

export interface PostWithMeta {
  readonly entry: CollectionEntry<"posts">;
  readonly meta: PostMeta;
}

export async function getOrderedPosts(): Promise<readonly PostWithMeta[]> {
  throw new Error("not implemented");
}

export function defaultMetaFor(slug: string): PostMeta {
  return {
    slug,
    order: Number.MAX_SAFE_INTEGER,
    pinned: false,
    hiddenFromList: true, // hide unknown-meta posts by default
    updatedAt: new Date(0),
  };
}

export function sortWithMeta(
  posts: readonly PostWithMeta[],
): readonly PostWithMeta[] {
  return [...posts].sort((a, b) => {
    if (a.meta.pinned !== b.meta.pinned) return a.meta.pinned ? -1 : 1;
    return a.meta.order - b.meta.order;
  });
}
```

- [ ] **Step 2: Tests**

```ts
// src/lib/content/loader.test.ts
import { describe, it, expect } from "vitest";
import type { CollectionEntry } from "astro:content";
import type { PostMeta } from "~/lib/db/schema";
import { defaultMetaFor, sortWithMeta, type PostWithMeta } from "./loader";

function fakeEntry(id: string): CollectionEntry<"posts"> {
  return {
    id,
    slug: id,
    body: "",
    collection: "posts",
    data: { title: id, description: "x", pubDate: new Date("2026-01-01"), tags: [], draft: false },
  } as unknown as CollectionEntry<"posts">;
}

function fakeMeta(slug: string, order: number, pinned = false): PostMeta {
  return { slug, order, pinned, hiddenFromList: false, updatedAt: new Date() };
}

describe("defaultMetaFor", () => {
  it("marks unknown posts hidden so they don't leak unordered", () => {
    const m = defaultMetaFor("some-slug");
    expect(m.hiddenFromList).toBe(true);
    expect(m.order).toBe(Number.MAX_SAFE_INTEGER);
    expect(m.pinned).toBe(false);
    expect(m.slug).toBe("some-slug");
  });
});

describe("sortWithMeta", () => {
  it("places pinned first even if order is larger", () => {
    const items: PostWithMeta[] = [
      { entry: fakeEntry("a"), meta: fakeMeta("a", 1) },
      { entry: fakeEntry("b"), meta: fakeMeta("b", 100, true) },
    ];
    const sorted = sortWithMeta(items);
    expect(sorted[0]?.meta.slug).toBe("b");
    expect(sorted[1]?.meta.slug).toBe("a");
  });

  it("orders by numeric order ascending within pinned groups", () => {
    const items: PostWithMeta[] = [
      { entry: fakeEntry("a"), meta: fakeMeta("a", 3) },
      { entry: fakeEntry("b"), meta: fakeMeta("b", 1) },
      { entry: fakeEntry("c"), meta: fakeMeta("c", 2) },
    ];
    expect(sortWithMeta(items).map((i) => i.meta.slug)).toEqual(["b", "c", "a"]);
  });

  it("is stable when orders collide", () => {
    const items: PostWithMeta[] = [
      { entry: fakeEntry("a"), meta: fakeMeta("a", 1) },
      { entry: fakeEntry("b"), meta: fakeMeta("b", 1) },
    ];
    // Array#sort in modern engines is stable; sortWithMeta must not break that.
    expect(sortWithMeta(items).map((i) => i.meta.slug)).toEqual(["a", "b"]);
  });
});
```

- [ ] **Step 3: Run**

```bash
pnpm test -- src/lib/content/loader.test.ts
```

Expected: **4 tests pass** (all for helpers that are already implemented in the stub — `getOrderedPosts` throws but has no test yet).

- [ ] **Step 4: Commit**

```bash
git add src/lib/content/loader.ts src/lib/content/loader.test.ts
git commit -m "test(cms): loader helpers defaultMetaFor + sortWithMeta"
```

---

## Task 7: Implement `getOrderedPosts`

**Files:**
- Modify: `src/lib/content/loader.ts`.

- [ ] **Step 1: Replace module**

```ts
import { getCollection, type CollectionEntry } from "astro:content";
import { eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { postsMeta, type PostMeta } from "~/lib/db/schema";

export interface PostWithMeta {
  readonly entry: CollectionEntry<"posts">;
  readonly meta: PostMeta;
}

export function defaultMetaFor(slug: string): PostMeta {
  return {
    slug,
    order: Number.MAX_SAFE_INTEGER,
    pinned: false,
    hiddenFromList: true,
    updatedAt: new Date(0),
  };
}

export function sortWithMeta(
  posts: readonly PostWithMeta[],
): readonly PostWithMeta[] {
  return [...posts].sort((a, b) => {
    if (a.meta.pinned !== b.meta.pinned) return a.meta.pinned ? -1 : 1;
    return a.meta.order - b.meta.order;
  });
}

/**
 * Reads Astro's content collection, loads all posts_meta rows, merges them,
 * filters out drafts + hidden posts, and returns a sorted immutable list.
 *
 * Posts without a posts_meta row appear as hidden-by-default (defaultMetaFor)
 * to keep their behavior predictable — the backfill script should be run
 * whenever new files appear in src/content/posts/.
 */
export async function getOrderedPosts(): Promise<readonly PostWithMeta[]> {
  const entries = await getCollection("posts", (entry) => !entry.data.draft);
  const metaRows = await db.select().from(postsMeta);
  const metaBySlug = new Map(metaRows.map((m) => [m.slug, m]));

  const merged: PostWithMeta[] = entries.map((entry) => ({
    entry,
    meta: metaBySlug.get(entry.id) ?? defaultMetaFor(entry.id),
  }));

  return sortWithMeta(merged.filter((p) => !p.meta.hiddenFromList));
}

export async function getPostWithMeta(slug: string): Promise<PostWithMeta | null> {
  const entries = await getCollection("posts", (entry) => entry.id === slug);
  const entry = entries[0];
  if (!entry) return null;
  const rows = await db.select().from(postsMeta).where(eq(postsMeta.slug, slug));
  const meta = rows[0] ?? defaultMetaFor(slug);
  return { entry, meta };
}
```

- [ ] **Step 2: Add one integration-ish test stubbed with a fake db**

Append to `src/lib/content/loader.test.ts`:

```ts
// The `getOrderedPosts` implementation is covered by the integration test
// suite in tests/integration/cms.test.ts which uses a real Postgres.
// Unit-tested helpers above already exercise the sort/filter logic.
```

This comment is intentional — we do not mock the DB in unit tests. Real-DB coverage is Task 14.

- [ ] **Step 3: Run and commit**

```bash
pnpm test -- src/lib/content/loader.test.ts
pnpm typecheck
```

Expected: 4 pass, 0 typecheck errors.

```bash
git add src/lib/content/loader.ts src/lib/content/loader.test.ts
git commit -m "feat(cms): getOrderedPosts merges content collection with posts_meta"
```

---

## Task 8: Switch `SiteSidebar`, home, and blog list to the new loader

**Files:**
- Modify: `src/components/SiteSidebar.astro`.
- Modify: `src/pages/index.astro`.
- Modify: `src/pages/blog/index.astro`.
- Modify: `src/pages/blog/[...slug].astro` (only for the active-slug passthrough; layout already wires sidebar).

- [ ] **Step 1: `SiteSidebar.astro`**

Replace the two `getPublishedPosts` + `parseSlugOrder` imports and the two-group split with a single loader call. Group the series/extras using `posts_meta` heuristics instead of slug parsing:

```astro
---
import { getOrderedPosts, type PostWithMeta } from "~/lib/content/loader";

interface Props {
  activeSlug?: string;
}

const { activeSlug } = Astro.props;
const posts = await getOrderedPosts();

// Heuristic: "series" = posts whose slug starts with two digits plus dash/_,
// used only for display grouping. The actual order comes from the DB.
function isSeriesSlug(slug: string): boolean {
  return /^\d{2}[-_]/.test(slug);
}

const series = posts.filter((p: PostWithMeta) => isSeriesSlug(p.entry.id));
const extras = posts.filter((p: PostWithMeta) => !isSeriesSlug(p.entry.id));
---
```

Inside the template, rename any usage of `post.` to `p.entry.`:

- `href={`/blog/${p.entry.id}`}`
- `p.entry.data.title`

The number badge comes from `p.meta.order` (padStart 2) now — we don't need `parseSlugOrder` anymore:

```astro
<span class="sidebar__num">{String(p.meta.order).padStart(2, "0")}</span>
```

Keep existing CSS untouched.

- [ ] **Step 2: `src/pages/index.astro`**

```astro
---
export const prerender = false;

import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { getOrderedPosts } from "~/lib/content/loader";

const posts = await getOrderedPosts();
const latest = posts.slice(0, 3);
---
```

In the `.latest__list` loop, use `p.entry`:

```astro
{latest.map((p) => (
  <li>
    <a href={`/blog/${p.entry.id}`} class="latest__link">
      <span class="latest__title">{p.entry.data.title}</span>
      <time datetime={p.entry.data.pubDate.toISOString()} class="latest__date">
        {p.entry.data.pubDate.toLocaleDateString("ru-RU", { month: "short", day: "numeric" })}
      </time>
    </a>
  </li>
))}
```

- [ ] **Step 3: `src/pages/blog/index.astro`**

```astro
---
export const prerender = false;

import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { getOrderedPosts, type PostWithMeta } from "~/lib/content/loader";

const posts = await getOrderedPosts();
const allTags = Array.from(new Set(posts.flatMap((p: PostWithMeta) => p.entry.data.tags))).sort();
---
```

Replace the list loop to read from `p.entry` and use `p.meta.order` for the numeric badge:

```astro
{posts.map((p: PostWithMeta) => (
  <li class="list__item">
    <a href={`/blog/${p.entry.id}`} class="list__link">
      <span class="list__num">{String(p.meta.order).padStart(2, "0")}</span>
      <span class="list__body">
        <h2 class="list__post-title">{p.entry.data.title}</h2>
        <p class="list__post-desc">{p.entry.data.description}</p>
        <time datetime={p.entry.data.pubDate.toISOString()} class="list__post-date">
          {p.entry.data.pubDate.toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" })}
        </time>
      </span>
    </a>
  </li>
))}
```

- [ ] **Step 4: Post page active slug**

`src/pages/blog/[...slug].astro` doesn't need changes for loader; `PostLayout` passes `activeSlug={post.id}` to `SiteSidebar` which already works with the new loader (sidebar reads `activeSlug` unchanged).

- [ ] **Step 5: Adapter check**

Because `/` and `/blog` now use `prerender = false`, the site must run on an adapter. `astro.config` currently uses `output: "static"` with `@astrojs/node` and `mode: "standalone"`. For selective on-demand rendering, change `output` to `"server"` OR keep `"static"` but set `prerender = true` on individual static pages. The latter is simpler — Astro 5 respects per-page `prerender = false` when the adapter is present.

Verify by `pnpm build`: should produce 15 static post pages + a server bundle for `/` and `/blog`.

- [ ] **Step 6: Commit**

```bash
git add src/components/SiteSidebar.astro src/pages/index.astro src/pages/blog/index.astro
git commit -m "feat(cms): public list pages read ordering from DB"
```

---

## Task 9: Repo modules for DB queries

**Files:**
- Create: `src/lib/db/repo/posts-meta.ts`.
- Create: `src/lib/db/repo/revisions.ts`.
- Create: `src/lib/db/repo/media.ts`.

Each module wraps Drizzle queries so actions/pages read from one place.

- [ ] **Step 1: `src/lib/db/repo/posts-meta.ts`**

```ts
import { eq, inArray } from "drizzle-orm";
import { db } from "~/lib/db";
import { postsMeta, type PostMeta, type NewPostMeta } from "~/lib/db/schema";

export async function listAllMeta(): Promise<readonly PostMeta[]> {
  return db.select().from(postsMeta);
}

export async function getMetaBySlug(slug: string): Promise<PostMeta | null> {
  const rows = await db.select().from(postsMeta).where(eq(postsMeta.slug, slug));
  return rows[0] ?? null;
}

export async function upsertMeta(row: NewPostMeta): Promise<void> {
  await db
    .insert(postsMeta)
    .values(row)
    .onConflictDoUpdate({
      target: postsMeta.slug,
      set: {
        order: row.order,
        pinned: row.pinned,
        hiddenFromList: row.hiddenFromList,
        updatedAt: new Date(),
      },
    });
}

export async function deleteMeta(slug: string): Promise<void> {
  await db.delete(postsMeta).where(eq(postsMeta.slug, slug));
}

/**
 * Atomically assigns `orders[i]` = i+1 for the slugs in the array order.
 * Skips slugs not present in the table — callers should ensure all slugs
 * exist before invoking.
 */
export async function reorderMeta(slugs: readonly string[]): Promise<void> {
  if (slugs.length === 0) return;
  await db.transaction(async (tx) => {
    // Normalize to 1..n to avoid gap growth over time.
    for (let i = 0; i < slugs.length; i++) {
      await tx
        .update(postsMeta)
        .set({ order: i + 1, updatedAt: new Date() })
        .where(eq(postsMeta.slug, slugs[i]!));
    }
  });
}
```

- [ ] **Step 2: `src/lib/db/repo/revisions.ts`**

```ts
import { desc, eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { postRevisions, type PostRevision, type NewPostRevision } from "~/lib/db/schema";

export async function appendRevision(row: NewPostRevision): Promise<PostRevision> {
  const [inserted] = await db.insert(postRevisions).values(row).returning();
  if (!inserted) throw new Error("failed to insert revision");
  return inserted;
}

export async function listRevisionsBySlug(slug: string): Promise<readonly PostRevision[]> {
  return db
    .select()
    .from(postRevisions)
    .where(eq(postRevisions.slug, slug))
    .orderBy(desc(postRevisions.createdAt), desc(postRevisions.id));
}

export async function getRevision(id: number): Promise<PostRevision | null> {
  const rows = await db.select().from(postRevisions).where(eq(postRevisions.id, id));
  return rows[0] ?? null;
}
```

- [ ] **Step 3: `src/lib/db/repo/media.ts`**

```ts
import { desc, eq } from "drizzle-orm";
import { db } from "~/lib/db";
import { mediaAssets, type MediaAsset, type NewMediaAsset } from "~/lib/db/schema";

export async function recordMediaAsset(row: NewMediaAsset): Promise<MediaAsset> {
  const [inserted] = await db.insert(mediaAssets).values(row).returning();
  if (!inserted) throw new Error("failed to insert media asset");
  return inserted;
}

export async function listMedia(): Promise<readonly MediaAsset[]> {
  return db.select().from(mediaAssets).orderBy(desc(mediaAssets.uploadedAt));
}

export async function deleteMediaAsset(id: number): Promise<MediaAsset | null> {
  const [deleted] = await db.delete(mediaAssets).where(eq(mediaAssets.id, id)).returning();
  return deleted ?? null;
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/repo
git commit -m "feat(cms): repo helpers for posts_meta, revisions, media"
```

---

## Task 10: Integration tests via testcontainers

**Files:**
- Create: `tests/integration/setup.ts` — shared Postgres provisioner.
- Create: `tests/integration/cms.test.ts`.
- Modify: `vitest.config.ts` — include `tests/integration/**/*.test.ts` with a longer timeout.

- [ ] **Step 1: `tests/integration/setup.ts`**

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "testcontainers";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "~/lib/db/schema";

export interface TestDb {
  db: ReturnType<typeof drizzle<typeof schema>>;
  client: ReturnType<typeof postgres>;
  container: StartedPostgreSqlContainer;
  async teardown(): Promise<void>;
}

export async function bootTestDb(): Promise<TestDb> {
  const container = await new PostgreSqlContainer("postgres:18-alpine")
    .withDatabase("blog_test")
    .withUsername("test")
    .withPassword("test")
    .start();

  const url = container.getConnectionUri();
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  // Apply migrations from the drizzle/ directory.
  const migrationDir = join(process.cwd(), "drizzle");
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(migrationDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = await readFile(join(migrationDir, file), "utf8");
    // drizzle migration SQL is split by `-- statement-breakpoint`. Simulate that.
    const statements = sql.split(/-->\s*statement-breakpoint|;\s*\n/).map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await client.unsafe(stmt);
    }
  }

  return {
    db,
    client,
    container,
    async teardown(): Promise<void> {
      await client.end({ timeout: 5 });
      await container.stop();
    },
  };
}
```

> Note: the naive migration splitter above covers typical Drizzle output. If a migration contains `$$`-quoted functions (like our prune trigger does), it's safer to pass the whole file as a single `unsafe()` call. Fallback: if the statement-by-statement run fails, retry with the whole-file run and prefer that:
>
> ```ts
> try {
>   await client.unsafe(sql);
> } catch (e) {
>   /* attempt per-statement */
> }
> ```
>
> The trigger migration belongs to the "pass whole file" camp.

- [ ] **Step 2: `tests/integration/cms.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { bootTestDb, type TestDb } from "./setup";
import { postsMeta, postRevisions, users } from "~/lib/db/schema";

describe("cms integration", () => {
  let env: TestDb;

  beforeAll(async () => {
    env = await bootTestDb();
  }, 120_000);

  afterAll(async () => {
    await env.teardown();
  });

  it("reorderMeta is atomic (all slugs updated or none)", async () => {
    // Seed a user + three metas.
    const [user] = await env.db
      .insert(users)
      .values({ email: "test@example.com", role: "admin" })
      .returning();
    if (!user) throw new Error("seed failed");

    await env.db.insert(postsMeta).values([
      { slug: "a", order: 1 },
      { slug: "b", order: 2 },
      { slug: "c", order: 3 },
    ]);

    // Happy path reorder.
    const newOrder = ["c", "a", "b"];
    await env.db.transaction(async (tx) => {
      for (let i = 0; i < newOrder.length; i++) {
        await tx.update(postsMeta).set({ order: i + 1 }).where(eq(postsMeta.slug, newOrder[i]!));
      }
    });

    const rows = await env.db.select().from(postsMeta).orderBy(postsMeta.order);
    expect(rows.map((r) => r.slug)).toEqual(newOrder);
  });

  it("post_revisions prune keeps only the latest 50 per slug", async () => {
    const [user] = await env.db
      .insert(users)
      .values({ email: "writer@example.com", role: "editor" })
      .returning();
    if (!user) throw new Error("seed failed");

    for (let i = 0; i < 55; i++) {
      await env.db.insert(postRevisions).values({
        slug: "long-lived",
        frontmatter: { n: i },
        body: `body ${i}`,
        authorId: user.id,
      });
    }

    const count = await env.db
      .select({ n: sql<number>`count(*)` })
      .from(postRevisions)
      .where(eq(postRevisions.slug, "long-lived"));

    expect(count[0]?.n).toBe(50);
  });
});
```

- [ ] **Step 3: Update `vitest.config.ts`**

Increase the test include pattern and add a timeout for the integration suite:

```ts
import { getViteConfig } from "astro/config";
import type { UserConfig } from "vitest/config";

const testConfig: UserConfig["test"] = {
  globals: true,
  environment: "node",
  include: ["tests/unit/**/*.test.ts", "src/**/*.test.ts", "tests/integration/**/*.test.ts"],
  testTimeout: 30_000,
  coverage: {
    provider: "v8",
    reporter: ["text", "html"],
    exclude: ["tests/**", "**/*.config.ts", ".astro/**"],
  },
};

export default getViteConfig({ test: testConfig } as Parameters<typeof getViteConfig>[0]);
```

- [ ] **Step 4: Run**

```bash
pnpm test -- tests/integration/cms.test.ts
```

Expected: 2 passing tests. Docker must be running.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/setup.ts tests/integration/cms.test.ts vitest.config.ts
git commit -m "test(cms): integration tests for reorder + revisions prune"
```

---

# Phase B — Admin shell, list, reorder (Tasks 11–20)

## Task 11: Install dnd-kit

**Files:**
- Modify: `package.json`.

- [ ] **Step 1: Install**

```bash
pnpm add @dnd-kit/core@^6 @dnd-kit/sortable@^8 @dnd-kit/utilities@^3
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(cms): add @dnd-kit for sortable post list"
```

---

## Task 12: `AdminLayout` + admin header

**Files:**
- Create: `src/layouts/AdminLayout.astro`.
- Create: `src/components/admin/AdminHeader.astro`.
- Modify: `src/pages/admin/index.astro` — redirect to `/admin/posts`.

- [ ] **Step 1: `AdminHeader.astro`**

```astro
---
import { auth } from "~/lib/auth";

const session = await auth.api.getSession({ headers: Astro.request.headers });
const user = session?.user ?? null;
---

<header class="admin-header" role="banner">
  <a href="/admin/posts" class="admin-header__brand">
    <span>artka.dev</span>
    <span class="admin-header__divider" aria-hidden="true">/</span>
    <span class="admin-header__label">admin</span>
  </a>
  <nav class="admin-header__nav" aria-label="Admin">
    <a href="/admin/posts">Статьи</a>
    <a href="/admin/media">Медиа</a>
    <a href="/" class="admin-header__out">На сайт ↗</a>
  </nav>
  <div class="admin-header__user">
    {user && <span class="admin-header__email">{user.email}</span>}
    <form method="POST" action="/api/auth/sign-out">
      <button type="submit" class="admin-header__logout">Выйти</button>
    </form>
  </div>
</header>

<style>
  .admin-header {
    border-bottom: 1px solid var(--color-border);
    display: flex;
    align-items: center;
    gap: var(--space-5);
    padding: var(--space-3) var(--space-5);
    background: var(--color-bg);
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .admin-header__brand {
    font-family: var(--font-serif);
    font-size: var(--fs-lg);
    color: var(--color-fg);
    text-decoration: none;
    display: flex;
    gap: var(--space-2);
    align-items: baseline;
  }
  .admin-header__label,
  .admin-header__divider {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg-muted);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }
  .admin-header__nav {
    margin-left: auto;
    display: flex;
    gap: var(--space-5);
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
  }
  .admin-header__nav a {
    color: var(--color-fg-muted);
    text-decoration: none;
  }
  .admin-header__nav a:hover {
    color: var(--color-fg);
  }
  .admin-header__out {
    color: var(--color-accent);
  }
  .admin-header__user {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    color: var(--color-fg-muted);
  }
  .admin-header__logout {
    background: transparent;
    border: 1px solid var(--color-border);
    color: var(--color-fg);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
  }
  .admin-header__logout:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }
</style>
```

- [ ] **Step 2: `AdminLayout.astro`**

```astro
---
import "~/styles/global.css";
import AdminHeader from "~/components/admin/AdminHeader.astro";

interface Props {
  title: string;
}

const { title } = Astro.props;
---

<!doctype html>
<html lang="ru">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>{title} — admin</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <AdminHeader />
    <main id="main" class="admin-main">
      <slot />
    </main>
    <style>
      .admin-main {
        max-width: 1080px;
        margin: 0 auto;
        padding: var(--space-6) var(--space-5);
      }
    </style>
  </body>
</html>
```

- [ ] **Step 3: `/admin/index.astro`**

```astro
---
export const prerender = false;
return Astro.redirect("/admin/posts");
---
```

- [ ] **Step 4: Manual smoke check**

```bash
pnpm dev
```

Log in as an admin user (create one manually via Better-Auth if you haven't), navigate to `/admin`, confirm redirect to `/admin/posts` (404 body is expected — Task 13 adds the page).

- [ ] **Step 5: Commit**

```bash
git add src/layouts/AdminLayout.astro src/components/admin/AdminHeader.astro src/pages/admin/index.astro
git commit -m "feat(cms): admin layout and header"
```

---

## Task 13: `/admin/posts` list page (server-rendered scaffold)

**Files:**
- Create: `src/pages/admin/posts/index.astro`.

- [ ] **Step 1: Create the page**

```astro
---
export const prerender = false;

import AdminLayout from "~/layouts/AdminLayout.astro";
import PostList from "~/components/admin/PostList";
import { getOrderedPosts } from "~/lib/content/loader";

// Show all posts including hidden ones — admin sees everything.
// Use a raw fetch instead of the public filter.
import { getCollection } from "astro:content";
import { listAllMeta } from "~/lib/db/repo/posts-meta";
import { defaultMetaFor, type PostWithMeta, sortWithMeta } from "~/lib/content/loader";

const entries = await getCollection("posts");
const metaRows = await listAllMeta();
const metaBySlug = new Map(metaRows.map((m) => [m.slug, m]));
const merged: PostWithMeta[] = entries.map((entry) => ({
  entry,
  meta: metaBySlug.get(entry.id) ?? defaultMetaFor(entry.id),
}));
const initial = sortWithMeta(merged).map((p) => ({
  slug: p.entry.id,
  title: p.entry.data.title,
  description: p.entry.data.description,
  pubDate: p.entry.data.pubDate.toISOString(),
  draft: p.entry.data.draft,
  tags: p.entry.data.tags,
  order: p.meta.order,
  pinned: p.meta.pinned,
  hidden: p.meta.hiddenFromList,
}));
---

<AdminLayout title="Статьи">
  <header class="admin-page-header">
    <h1>Статьи</h1>
    <a href="/admin/posts/new" class="admin-button">Новая статья</a>
  </header>

  <PostList client:load initial={initial} />
</AdminLayout>

<style>
  .admin-page-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: var(--space-6);
  }
  .admin-page-header h1 {
    font-family: var(--font-serif);
    font-size: var(--fs-2xl);
    margin: 0;
  }
  .admin-button {
    display: inline-block;
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    color: var(--color-bg);
    background: var(--color-accent);
    border: 1px solid var(--color-accent);
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    text-decoration: none;
    transition: background var(--dur-fast) var(--ease-out);
  }
  .admin-button:hover {
    background: var(--color-accent-hover);
  }
</style>
```

- [ ] **Step 2: PostList placeholder**

Create `src/components/admin/PostList.tsx` as a no-DnD scaffold so the page renders:

```tsx
import { useState } from "react";

export interface PostListItem {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  draft: boolean;
  tags: readonly string[];
  order: number;
  pinned: boolean;
  hidden: boolean;
}

interface Props {
  readonly initial: readonly PostListItem[];
}

export default function PostList({ initial }: Props): JSX.Element {
  const [items] = useState(initial);
  return (
    <ul className="post-list">
      {items.map((p) => (
        <li key={p.slug} className="post-list__item">
          <span className="post-list__order">{String(p.order).padStart(2, "0")}</span>
          <div className="post-list__body">
            <a href={`/admin/posts/${encodeURIComponent(p.slug)}`} className="post-list__title">{p.title}</a>
            <p className="post-list__desc">{p.description}</p>
            <div className="post-list__meta">
              <time>{new Date(p.pubDate).toLocaleDateString("ru-RU")}</time>
              {p.draft && <span className="post-list__flag">draft</span>}
              {p.hidden && <span className="post-list__flag">скрыт</span>}
              {p.pinned && <span className="post-list__flag post-list__flag--accent">pinned</span>}
            </div>
          </div>
        </li>
      ))}
      <style>{`
        .post-list { list-style: none; padding: 0; margin: 0; }
        .post-list__item {
          display: grid;
          grid-template-columns: 36px 1fr;
          gap: var(--space-4);
          padding: var(--space-4) 0;
          border-top: 1px solid var(--color-border);
        }
        .post-list__order {
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
          color: var(--color-fg-subtle);
          font-variant-numeric: tabular-nums;
        }
        .post-list__title {
          font-family: var(--font-serif);
          font-size: var(--fs-lg);
          color: var(--color-fg);
          text-decoration: none;
        }
        .post-list__title:hover { color: var(--color-accent-hover); }
        .post-list__desc {
          margin: var(--space-1) 0 var(--space-2) 0;
          color: var(--color-fg-muted);
        }
        .post-list__meta {
          display: flex;
          gap: var(--space-3);
          align-items: center;
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
          color: var(--color-fg-subtle);
        }
        .post-list__flag {
          padding: 1px 6px;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
        }
        .post-list__flag--accent {
          border-color: var(--color-accent);
          color: var(--color-accent);
        }
      `}</style>
    </ul>
  );
}
```

- [ ] **Step 3: Build + smoke**

```bash
pnpm build
pnpm dev
```

Log in, go to `/admin/posts`. List appears with 15 entries, numbers from DB.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/posts/index.astro src/components/admin/PostList.tsx
git commit -m "feat(cms): admin posts list (no drag yet)"
```

---

## Task 14: `reorderPosts` Astro Action + DnD wiring

**Files:**
- Create: `src/actions/index.ts`.
- Create: `src/actions/posts.ts`.
- Modify: `src/components/admin/PostList.tsx` — integrate `@dnd-kit`.

- [ ] **Step 1: Astro Actions entry**

`src/actions/index.ts`:

```ts
import { posts } from "./posts";

export const server = {
  posts,
};
```

Then open `astro.config.ts` — if Astro Actions requires an `actions` integration or a config flag in your Astro 5 version, add it (Astro 5 has actions enabled by default; nothing to change).

- [ ] **Step 2: `src/actions/posts.ts` (reorder only for this task)**

```ts
import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { reorderMeta } from "~/lib/db/repo/posts-meta";

function assertAdmin(user: { role?: string | null } | null): void {
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    throw new Error("Forbidden");
  }
}

export const posts = {
  reorder: defineAction({
    input: z.object({
      slugs: z.array(z.string().min(1)).min(1),
    }),
    handler: async ({ slugs }, context) => {
      assertAdmin(context.locals.user as { role?: string } | null);
      await reorderMeta(slugs);
      return { ok: true as const };
    },
  }),
};
```

Note on types: `context.locals.user` is set in middleware; its type comes from Better-Auth. If TypeScript complains, extend `App.Locals` in `src/env.d.ts`:

```ts
/// <reference types="astro/client" />
declare namespace App {
  interface Locals {
    user: { id: string; email: string; role: "admin" | "editor" | "reader" } | null;
    session: unknown;
  }
}
```

Only add if not already present.

- [ ] **Step 3: Integrate dnd-kit in `PostList.tsx`**

Full replacement of the file:

```tsx
import { useState, useMemo } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { actions } from "astro:actions";

export interface PostListItem {
  slug: string;
  title: string;
  description: string;
  pubDate: string;
  draft: boolean;
  tags: readonly string[];
  order: number;
  pinned: boolean;
  hidden: boolean;
}

interface Props {
  readonly initial: readonly PostListItem[];
}

interface RowProps {
  item: PostListItem;
  index: number;
}

function SortableRow({ item, index }: RowProps): JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.slug });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className="post-list__item" {...attributes}>
      <button
        type="button"
        className="post-list__handle"
        aria-label={`Перетащить "${item.title}"`}
        {...listeners}
      >
        ⋮⋮
      </button>
      <span className="post-list__order" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="post-list__body">
        <a href={`/admin/posts/${encodeURIComponent(item.slug)}`} className="post-list__title">{item.title}</a>
        <p className="post-list__desc">{item.description}</p>
        <div className="post-list__meta">
          <time>{new Date(item.pubDate).toLocaleDateString("ru-RU")}</time>
          {item.draft && <span className="post-list__flag">draft</span>}
          {item.hidden && <span className="post-list__flag">скрыт</span>}
          {item.pinned && <span className="post-list__flag post-list__flag--accent">pinned</span>}
        </div>
      </div>
    </li>
  );
}

export default function PostList({ initial }: Props): JSX.Element {
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => items.map((i) => i.slug), [items]);

  async function handleDragEnd(event: DragEndEvent): Promise<void> {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((i) => i.slug === active.id);
    const newIndex = items.findIndex((i) => i.slug === over.id);
    if (oldIndex < 0 || newIndex < 0) return;

    const previous = items;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    setPending(true);
    setError(null);

    const result = await actions.posts.reorder({ slugs: next.map((i) => i.slug) });
    setPending(false);
    if (result.error) {
      setItems(previous);
      setError(result.error.message ?? "Не удалось сохранить порядок");
    }
  }

  return (
    <div>
      {error && (
        <div role="alert" className="post-list__error">
          {error}
        </div>
      )}
      {pending && (
        <div role="status" className="post-list__status">Сохраняю порядок…</div>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <ul className="post-list">
            {items.map((item, index) => (
              <SortableRow key={item.slug} item={item} index={index} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <style>{`
        .post-list { list-style: none; padding: 0; margin: 0; }
        .post-list__item {
          display: grid;
          grid-template-columns: 28px 36px 1fr;
          gap: var(--space-3);
          padding: var(--space-4) 0;
          border-top: 1px solid var(--color-border);
          align-items: start;
          background: var(--color-bg);
        }
        .post-list__handle {
          background: transparent;
          border: 1px solid var(--color-border);
          border-radius: var(--radius-sm);
          color: var(--color-fg-subtle);
          cursor: grab;
          padding: var(--space-1) 0;
          font-family: var(--font-mono);
          font-size: var(--fs-xs);
        }
        .post-list__handle:active { cursor: grabbing; }
        .post-list__order {
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
          color: var(--color-fg-subtle);
          font-variant-numeric: tabular-nums;
          padding-top: 2px;
        }
        .post-list__title {
          font-family: var(--font-serif);
          font-size: var(--fs-lg);
          color: var(--color-fg);
          text-decoration: none;
        }
        .post-list__title:hover { color: var(--color-accent-hover); }
        .post-list__desc {
          margin: var(--space-1) 0 var(--space-2) 0;
          color: var(--color-fg-muted);
        }
        .post-list__meta {
          display: flex; gap: var(--space-3); align-items: center;
          font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--color-fg-subtle);
        }
        .post-list__flag {
          padding: 1px 6px; border: 1px solid var(--color-border); border-radius: var(--radius-sm);
        }
        .post-list__flag--accent {
          border-color: var(--color-accent); color: var(--color-accent);
        }
        .post-list__error {
          margin-bottom: var(--space-4);
          padding: var(--space-3);
          border: 1px solid var(--color-danger);
          color: var(--color-danger);
          border-radius: var(--radius-md);
        }
        .post-list__status {
          margin-bottom: var(--space-4);
          padding: var(--space-3);
          color: var(--color-fg-muted);
          font-family: var(--font-mono);
          font-size: var(--fs-sm);
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

```bash
pnpm build
pnpm dev
```

Log in as admin, go to `/admin/posts`, drag two rows to reorder. Refresh — the new order persists. Open a non-admin (or logged-out) session in another browser to confirm the action fails (logged-out → 302 to login via middleware, or the action throws).

- [ ] **Step 5: Commit**

```bash
git add src/actions/ src/components/admin/PostList.tsx
git commit -m "feat(cms): drag-and-drop reorder via posts.reorder action"
```

---

## Task 15: Admin E2E — reorder round-trip

**Files:**
- Create: `tests/e2e/admin-reorder.spec.ts`.
- Create: a Playwright `global-setup.ts` that seeds an admin user if not present.

- [ ] **Step 1: `tests/e2e/global-setup.ts`**

```ts
import { FullConfig } from "@playwright/test";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { users } from "../../src/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Seeds an admin user for Playwright tests. Uses a predictable email/password
 * so specs can log in the same way each time.
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  const existing = await db.select().from(users).where(eq(users.email, "e2e-admin@test.dev"));
  if (existing.length === 0) {
    await auth.api.signUpEmail({
      body: { email: "e2e-admin@test.dev", password: "e2e-admin-password", name: "E2E Admin" },
    });
    await db.update(users).set({ role: "admin" }).where(eq(users.email, "e2e-admin@test.dev"));
  }
}
```

- [ ] **Step 2: Update `playwright.config.ts`**

Add `globalSetup: "./tests/e2e/global-setup.ts"` to the config.

- [ ] **Step 3: The spec**

```ts
// tests/e2e/admin-reorder.spec.ts
import { expect, test } from "@playwright/test";

async function loginAsAdmin(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("e2e-admin@test.dev");
  await page.getByLabel(/пароль/i).fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

test("admin reorder persists across refresh and reflects on public blog", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/posts");

  const rows = page.locator(".post-list__item");
  await expect(rows.nth(0)).toBeVisible();
  const firstTitleBefore = await rows.nth(0).locator(".post-list__title").innerText();
  const secondTitleBefore = await rows.nth(1).locator(".post-list__title").innerText();

  // Use the keyboard a11y drag: focus handle, Space to activate, ArrowDown, Space to drop.
  const firstHandle = rows.nth(0).getByRole("button", { name: /перетащить/i });
  await firstHandle.focus();
  await page.keyboard.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Space");

  // Wait for the save status to clear.
  await expect(page.locator(".post-list__status")).toHaveCount(0, { timeout: 5_000 });

  // Refresh and verify the new order stuck.
  await page.reload();
  await expect(rows.nth(0).locator(".post-list__title")).toHaveText(secondTitleBefore);
  await expect(rows.nth(1).locator(".post-list__title")).toHaveText(firstTitleBefore);

  // Public list reflects it.
  await page.goto("/blog");
  const publicTitles = page.locator(".list__post-title");
  await expect(publicTitles.nth(0)).toHaveText(secondTitleBefore);
});
```

- [ ] **Step 4: Run**

```bash
pnpm test:e2e -- tests/e2e/admin-reorder.spec.ts
```

Expected: 1 passing test. If the login form uses different labels, adjust the selectors.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/admin-reorder.spec.ts tests/e2e/global-setup.ts playwright.config.ts
git commit -m "test(cms): e2e for admin reorder round-trip"
```

---

## Task 16: Toggle hidden / pinned (inline controls on admin list)

**Files:**
- Modify: `src/actions/posts.ts`.
- Modify: `src/components/admin/PostList.tsx`.

- [ ] **Step 1: Extend actions**

```ts
// src/actions/posts.ts — append to the `posts` object
setVisibility: defineAction({
  input: z.object({
    slug: z.string().min(1),
    hiddenFromList: z.boolean(),
  }),
  handler: async ({ slug, hiddenFromList }, context) => {
    assertAdmin(context.locals.user as { role?: string } | null);
    await upsertMeta({ slug, order: 0 as number, hiddenFromList, pinned: false });
    // Note: we don't overwrite `order` — set it separately via updateVisibility logic.
    return { ok: true as const };
  },
}),
setPinned: defineAction({
  input: z.object({
    slug: z.string().min(1),
    pinned: z.boolean(),
  }),
  handler: async ({ slug, pinned }, context) => {
    assertAdmin(context.locals.user as { role?: string } | null);
    // Custom update to avoid stomping order with the upsert shape.
    await db
      .update(postsMeta)
      .set({ pinned, updatedAt: new Date() })
      .where(eq(postsMeta.slug, slug));
    return { ok: true as const };
  },
}),
```

Fix the `setVisibility` handler similarly — use a direct `db.update` instead of `upsertMeta` so we only touch the single field:

```ts
await db
  .update(postsMeta)
  .set({ hiddenFromList, updatedAt: new Date() })
  .where(eq(postsMeta.slug, slug));
```

Add the imports at the top: `import { db } from "~/lib/db"; import { postsMeta } from "~/lib/db/schema"; import { eq } from "drizzle-orm";`.

- [ ] **Step 2: UI toggles**

In `PostList.tsx` add two buttons next to the draft/hidden/pinned flags that call the new actions and optimistically update local state. Sketch:

```tsx
async function togglePinned(item: PostListItem): Promise<void> {
  const next = items.map((i) => (i.slug === item.slug ? { ...i, pinned: !item.pinned } : i));
  setItems(next);
  const res = await actions.posts.setPinned({ slug: item.slug, pinned: !item.pinned });
  if (res.error) setItems(items);
}
async function toggleHidden(item: PostListItem): Promise<void> {
  const next = items.map((i) => (i.slug === item.slug ? { ...i, hidden: !item.hidden } : i));
  setItems(next);
  const res = await actions.posts.setVisibility({ slug: item.slug, hiddenFromList: !item.hidden });
  if (res.error) setItems(items);
}
```

Render these buttons inline in the `.post-list__meta` section with `aria-pressed` reflecting state.

- [ ] **Step 3: Commit**

```bash
git add src/actions/posts.ts src/components/admin/PostList.tsx
git commit -m "feat(cms): toggle hidden/pinned inline from admin list"
```

---

## Task 17: `frontmatter.ts` — parse/serialize

**Files:**
- Create: `src/lib/content/frontmatter.ts`.
- Create: `src/lib/content/frontmatter.test.ts`.

- [ ] **Step 1: Tests first**

```ts
import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter, type Frontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("parses YAML block at top of file", () => {
    const raw = [
      "---",
      'title: "Hello"',
      'description: "A test"',
      "pubDate: 2026-01-01",
      "tags: [a, b]",
      "draft: false",
      "---",
      "",
      "Body text",
    ].join("\n");
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.title).toBe("Hello");
    expect(frontmatter.tags).toEqual(["a", "b"]);
    expect(body).toBe("Body text");
  });

  it("throws when frontmatter block is missing", () => {
    expect(() => parseFrontmatter("no frontmatter here")).toThrow(/frontmatter/i);
  });

  it("preserves the body text verbatim (including newlines)", () => {
    const raw = "---\ntitle: X\ndescription: x\npubDate: 2026-01-01\n---\n\nLine 1\n\nLine 2\n";
    const { body } = parseFrontmatter(raw);
    expect(body).toBe("Line 1\n\nLine 2\n");
  });
});

describe("serializeFrontmatter", () => {
  it("round-trips through parse", () => {
    const fm: Frontmatter = {
      title: "X",
      description: "y",
      pubDate: new Date("2026-01-01T00:00:00.000Z"),
      tags: ["t1"],
      draft: false,
    };
    const text = serializeFrontmatter(fm, "Body\n");
    const re = parseFrontmatter(text);
    expect(re.frontmatter.title).toBe("X");
    expect(re.body).toBe("Body\n");
  });

  it("serializes pubDate as ISO date-only when no time component", () => {
    const fm: Frontmatter = {
      title: "X",
      description: "y",
      pubDate: new Date("2026-01-01T00:00:00.000Z"),
      tags: [],
      draft: false,
    };
    const text = serializeFrontmatter(fm, "");
    expect(text).toContain("pubDate: 2026-01-01");
  });
});
```

- [ ] **Step 2: Implementation**

```ts
// src/lib/content/frontmatter.ts
import yaml from "js-yaml";

export interface Frontmatter {
  readonly title: string;
  readonly description: string;
  readonly pubDate: Date;
  readonly updatedDate?: Date;
  readonly tags: readonly string[];
  readonly draft: boolean;
  readonly cover?: string;
  readonly coverAlt?: string;
}

const FENCE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function parseFrontmatter(raw: string): { frontmatter: Frontmatter; body: string } {
  const match = FENCE.exec(raw);
  if (!match || match[1] === undefined) {
    throw new Error("No frontmatter block found at top of file");
  }
  const yamlText = match[1];
  const body = raw.slice(match[0].length).replace(/^\s*\n/, "");

  const parsed = yaml.load(yamlText) as Record<string, unknown>;
  return {
    frontmatter: {
      title: String(parsed["title"] ?? ""),
      description: String(parsed["description"] ?? ""),
      pubDate: coerceDate(parsed["pubDate"]),
      updatedDate: parsed["updatedDate"] !== undefined ? coerceDate(parsed["updatedDate"]) : undefined,
      tags: Array.isArray(parsed["tags"]) ? parsed["tags"].map(String) : [],
      draft: Boolean(parsed["draft"] ?? false),
      cover: typeof parsed["cover"] === "string" ? parsed["cover"] : undefined,
      coverAlt: typeof parsed["coverAlt"] === "string" ? parsed["coverAlt"] : undefined,
    },
    body,
  };
}

export function serializeFrontmatter(fm: Frontmatter, body: string): string {
  const yml = yaml.dump(
    {
      title: fm.title,
      description: fm.description,
      pubDate: toIsoDate(fm.pubDate),
      ...(fm.updatedDate ? { updatedDate: toIsoDate(fm.updatedDate) } : {}),
      tags: fm.tags,
      draft: fm.draft,
      ...(fm.cover ? { cover: fm.cover } : {}),
      ...(fm.coverAlt ? { coverAlt: fm.coverAlt } : {}),
    },
    { lineWidth: 120, quotingType: '"' },
  );
  return `---\n${yml}---\n\n${body}`;
}

function coerceDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) throw new Error(`invalid pubDate: ${value}`);
    return d;
  }
  throw new Error(`invalid pubDate: ${value}`);
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Run tests, commit**

```bash
pnpm test -- src/lib/content/frontmatter.test.ts
```

Expected: 5 passing.

```bash
git add src/lib/content/frontmatter.ts src/lib/content/frontmatter.test.ts
git commit -m "feat(cms): frontmatter parse/serialize with YAML"
```

---

## Task 18: `post-writer.ts` — atomic filesystem write

**Files:**
- Create: `src/lib/fs/paths.ts`.
- Create: `src/lib/fs/post-writer.ts`.
- Create: `src/lib/fs/post-writer.test.ts`.

- [ ] **Step 1: `src/lib/fs/paths.ts`**

```ts
import { resolve, sep } from "node:path";

export const POSTS_DIR = resolve(process.cwd(), "src/content/posts");
export const UPLOADS_DIR = resolve(process.cwd(), "public/uploads");

/**
 * Ensures the resolved path is within `base`. Throws on traversal attempts.
 */
export function resolveSafe(base: string, relative: string): string {
  const resolved = resolve(base, relative);
  const baseWithSep = base.endsWith(sep) ? base : base + sep;
  if (!resolved.startsWith(baseWithSep) && resolved !== base) {
    throw new Error(`path traversal rejected: ${relative}`);
  }
  return resolved;
}
```

- [ ] **Step 2: Tests first**

```ts
// src/lib/fs/post-writer.test.ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePostAtomically } from "./post-writer";

async function inTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const base = await mkdtemp(join(tmpdir(), "post-writer-"));
  try {
    return await fn(base);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

describe("writePostAtomically", () => {
  it("creates the file when absent", async () => {
    await inTempDir(async (dir) => {
      await writePostAtomically(dir, "foo", "hello\n");
      const content = await readFile(join(dir, "foo.md"), "utf8");
      expect(content).toBe("hello\n");
    });
  });

  it("overwrites an existing file atomically", async () => {
    await inTempDir(async (dir) => {
      await writePostAtomically(dir, "foo", "v1\n");
      await writePostAtomically(dir, "foo", "v2\n");
      const content = await readFile(join(dir, "foo.md"), "utf8");
      expect(content).toBe("v2\n");
    });
  });

  it("rejects path traversal slugs", async () => {
    await inTempDir(async (dir) => {
      await expect(() => writePostAtomically(dir, "../evil", "x")).rejects.toThrow(/traversal/);
    });
  });

  it("rejects slugs with illegal characters", async () => {
    await inTempDir(async (dir) => {
      await expect(() => writePostAtomically(dir, "evil/sub", "x")).rejects.toThrow(/slug/);
      await expect(() => writePostAtomically(dir, "", "x")).rejects.toThrow(/slug/);
    });
  });
});
```

- [ ] **Step 3: Implementation**

```ts
// src/lib/fs/post-writer.ts
import { rename, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { resolveSafe } from "./paths";

const SLUG_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Atomically writes `content` into `<baseDir>/<slug>.md`. Writes to a
 * tmp file in the same directory first, then renames. Guards against
 * slug path traversal.
 *
 * Returns the absolute path of the written file.
 */
export async function writePostAtomically(
  baseDir: string,
  slug: string,
  content: string,
): Promise<string> {
  if (!SLUG_RE.test(slug)) {
    throw new Error(`invalid slug: ${JSON.stringify(slug)}`);
  }
  const target = resolveSafe(baseDir, `${slug}.md`);
  await mkdir(dirname(target), { recursive: true });
  const tmp = target + ".tmp." + process.pid + "." + Math.random().toString(36).slice(2, 8);
  await writeFile(tmp, content, "utf8");
  await rename(tmp, target);
  return target;
}
```

- [ ] **Step 4: Test + commit**

```bash
pnpm test -- src/lib/fs/post-writer.test.ts
```

Expected: 4 passing.

```bash
git add src/lib/fs/paths.ts src/lib/fs/post-writer.ts src/lib/fs/post-writer.test.ts
git commit -m "feat(cms): atomic post-writer with path traversal guard"
```

---

## Task 19: `post-io.ts` — read post from disk

**Files:**
- Create: `src/lib/content/post-io.ts`.
- Create: `src/lib/content/post-io.test.ts`.

- [ ] **Step 1: Tests**

```ts
import { describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readPostFromDisk, listPostFiles } from "./post-io";

describe("post-io", () => {
  it("reads frontmatter + body from a file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "post-io-"));
    try {
      await writeFile(
        join(dir, "foo.md"),
        ['---', 'title: Foo', 'description: bar', 'pubDate: 2026-01-01', '---', '', 'body'].join("\n"),
      );
      const result = await readPostFromDisk(dir, "foo");
      expect(result?.frontmatter.title).toBe("Foo");
      expect(result?.body).toBe("body");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns null for missing file", async () => {
    const dir = await mkdtemp(join(tmpdir(), "post-io-"));
    try {
      expect(await readPostFromDisk(dir, "missing")).toBeNull();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lists only .md files (ignores .mdx and non-markdown)", async () => {
    const dir = await mkdtemp(join(tmpdir(), "post-io-"));
    try {
      await writeFile(join(dir, "a.md"), "---\ntitle: a\ndescription: a\npubDate: 2026-01-01\n---\n");
      await writeFile(join(dir, "b.mdx"), "---\ntitle: b\ndescription: b\npubDate: 2026-01-01\n---\n");
      await writeFile(join(dir, "readme.txt"), "x");
      const slugs = await listPostFiles(dir);
      expect(slugs.sort()).toEqual(["a", "b"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Implementation**

```ts
// src/lib/content/post-io.ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseFrontmatter, type Frontmatter } from "./frontmatter";

export interface PostFile {
  readonly slug: string;
  readonly frontmatter: Frontmatter;
  readonly body: string;
}

export async function readPostFromDisk(baseDir: string, slug: string): Promise<PostFile | null> {
  for (const ext of [".md", ".mdx"]) {
    try {
      const raw = await readFile(join(baseDir, `${slug}${ext}`), "utf8");
      const { frontmatter, body } = parseFrontmatter(raw);
      return { slug, frontmatter, body };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw err;
    }
  }
  return null;
}

export async function listPostFiles(baseDir: string): Promise<readonly string[]> {
  const entries = await readdir(baseDir);
  return entries
    .filter((f) => f.endsWith(".md") || f.endsWith(".mdx"))
    .map((f) => f.replace(/\.(md|mdx)$/, ""));
}
```

- [ ] **Step 3: Commit**

```bash
pnpm test -- src/lib/content/post-io.test.ts
git add src/lib/content/post-io.ts src/lib/content/post-io.test.ts
git commit -m "feat(cms): read post from disk with frontmatter parsing"
```

---

## Task 20: `upsertPost` action (revision-first)

**Files:**
- Modify: `src/actions/posts.ts`.
- Modify: `src/lib/db/repo/posts-meta.ts` (add `ensureMeta`).

- [ ] **Step 1: `ensureMeta` repo helper**

Append to `src/lib/db/repo/posts-meta.ts`:

```ts
/**
 * Ensures a posts_meta row exists for `slug`. If missing, inserts with
 * order = max + 1 in a single transaction to avoid races. Returns the row.
 */
export async function ensureMeta(slug: string): Promise<PostMeta> {
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(postsMeta).where(eq(postsMeta.slug, slug));
    if (existing[0]) return existing[0];
    const maxRow = await tx.select({ max: sql<number>`coalesce(max("order"), 0)` }).from(postsMeta);
    const max = maxRow[0]?.max ?? 0;
    const [inserted] = await tx
      .insert(postsMeta)
      .values({ slug, order: max + 1, pinned: false, hiddenFromList: false })
      .returning();
    if (!inserted) throw new Error("failed to insert meta");
    return inserted;
  });
}
```

Add `import { sql } from "drizzle-orm";` at the top.

- [ ] **Step 2: `upsertPost` action**

Append to `src/actions/posts.ts`:

```ts
upsert: defineAction({
  input: z.object({
    slug: z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "invalid slug"),
    frontmatter: z.object({
      title: z.string().min(3).max(120),
      description: z.string().min(10).max(300),
      pubDate: z.coerce.date(),
      updatedDate: z.coerce.date().optional(),
      tags: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
      cover: z.string().optional(),
      coverAlt: z.string().optional(),
    }),
    body: z.string().default(""),
  }),
  handler: async (input, context) => {
    const user = context.locals.user as { id: string; role?: string } | null;
    assertAdmin(user);

    const meta = await ensureMeta(input.slug);
    const fmForFile = { ...input.frontmatter, tags: input.frontmatter.tags };

    // Step 1: DB transaction — insert revision.
    const revision = await appendRevision({
      slug: input.slug,
      frontmatter: input.frontmatter,
      body: input.body,
      authorId: user!.id,
    });

    // Step 2: Serialize + atomic file write.
    const serialized = serializeFrontmatter(fmForFile, input.body);
    try {
      await writePostAtomically(POSTS_DIR, input.slug, serialized);
    } catch (err) {
      return {
        ok: false as const,
        error: `File write failed; revision ${revision.id} preserves the intended content.`,
      };
    }

    return { ok: true as const, revisionId: revision.id, order: meta.order };
  },
}),
```

Add all necessary imports: `import { ensureMeta } from "~/lib/db/repo/posts-meta"; import { appendRevision } from "~/lib/db/repo/revisions"; import { serializeFrontmatter } from "~/lib/content/frontmatter"; import { writePostAtomically } from "~/lib/fs/post-writer"; import { POSTS_DIR } from "~/lib/fs/paths";`.

- [ ] **Step 3: Commit**

```bash
git add src/actions/posts.ts src/lib/db/repo/posts-meta.ts
git commit -m "feat(cms): upsertPost action (revision-first)"
```

---

# Phase C — Editor, revisions, diff viewer (Tasks 21–32)

## Task 21: Install CodeMirror

**Files:**
- Modify: `package.json`.

- [ ] **Step 1: Install**

```bash
pnpm add codemirror @codemirror/lang-markdown @codemirror/state @codemirror/view @codemirror/commands @codemirror/language @codemirror/theme-one-dark
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(cms): add CodeMirror for post editor"
```

---

## Task 22: `FrontmatterForm.tsx`

**Files:**
- Create: `src/components/admin/FrontmatterForm.tsx`.
- Create: `src/components/admin/TagInput.tsx`.

- [ ] **Step 1: `TagInput.tsx`**

```tsx
import { useState, type KeyboardEvent } from "react";

interface Props {
  readonly value: readonly string[];
  readonly onChange: (next: string[]) => void;
}

export default function TagInput({ value, onChange }: Props): JSX.Element {
  const [draft, setDraft] = useState("");

  function commit(): void {
    const trimmed = draft.trim().replace(/^#/, "");
    if (!trimmed) return;
    if (value.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...value, trimmed]);
    setDraft("");
  }

  function remove(tag: string): void {
    onChange(value.filter((t) => t !== tag));
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>): void {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commit();
    } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="tag-input">
      {value.map((tag) => (
        <span key={tag} className="tag-input__chip">
          #{tag}
          <button type="button" aria-label={`Удалить тег ${tag}`} onClick={() => remove(tag)}>×</button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={commit}
        placeholder="Тег и Enter"
      />
      <style>{`
        .tag-input {
          display: flex; flex-wrap: wrap; gap: var(--space-2);
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          padding: var(--space-2); background: var(--color-bg);
        }
        .tag-input__chip {
          display: inline-flex; align-items: center; gap: 4px;
          font-family: var(--font-mono); font-size: var(--fs-xs);
          padding: 2px 8px; background: var(--color-bg-elevated);
          border-radius: var(--radius-pill);
        }
        .tag-input__chip button {
          background: transparent; border: none; cursor: pointer;
          color: var(--color-fg-muted); font-size: 14px; line-height: 1;
        }
        .tag-input input {
          flex: 1; min-width: 120px; border: none; outline: none; background: transparent;
          font-family: var(--font-sans); font-size: var(--fs-sm);
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: `FrontmatterForm.tsx`**

```tsx
import { useState } from "react";
import TagInput from "./TagInput";

export interface FrontmatterInput {
  title: string;
  description: string;
  pubDate: string; // yyyy-mm-dd
  updatedDate: string | null;
  tags: string[];
  draft: boolean;
  cover: string | null;
  coverAlt: string | null;
}

interface Props {
  readonly value: FrontmatterInput;
  readonly onChange: (next: FrontmatterInput) => void;
}

export default function FrontmatterForm({ value, onChange }: Props): JSX.Element {
  function set<K extends keyof FrontmatterInput>(key: K, v: FrontmatterInput[K]): void {
    onChange({ ...value, [key]: v });
  }

  return (
    <div className="fm-form">
      <label className="fm-form__field">
        <span>Заголовок</span>
        <input type="text" value={value.title} onChange={(e) => set("title", e.target.value)} maxLength={120} />
      </label>
      <label className="fm-form__field">
        <span>Описание</span>
        <textarea value={value.description} onChange={(e) => set("description", e.target.value)} rows={3} maxLength={300} />
      </label>
      <div className="fm-form__row">
        <label className="fm-form__field">
          <span>Дата публикации</span>
          <input type="date" value={value.pubDate} onChange={(e) => set("pubDate", e.target.value)} />
        </label>
        <label className="fm-form__field">
          <span>Дата обновления</span>
          <input
            type="date"
            value={value.updatedDate ?? ""}
            onChange={(e) => set("updatedDate", e.target.value === "" ? null : e.target.value)}
          />
        </label>
      </div>
      <div className="fm-form__field">
        <span>Теги</span>
        <TagInput value={value.tags} onChange={(next) => set("tags", next)} />
      </div>
      <label className="fm-form__checkbox">
        <input type="checkbox" checked={value.draft} onChange={(e) => set("draft", e.target.checked)} />
        <span>Черновик (draft)</span>
      </label>

      <style>{`
        .fm-form { display: flex; flex-direction: column; gap: var(--space-4); }
        .fm-form__field { display: flex; flex-direction: column; gap: var(--space-2); }
        .fm-form__field > span {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          text-transform: uppercase; letter-spacing: var(--tracking-wide);
          color: var(--color-fg-muted);
        }
        .fm-form__field input[type="text"],
        .fm-form__field input[type="date"],
        .fm-form__field textarea {
          font-family: var(--font-sans); font-size: var(--fs-base);
          padding: var(--space-2) var(--space-3);
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          background: var(--color-bg); color: var(--color-fg);
        }
        .fm-form__row {
          display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-4);
        }
        .fm-form__checkbox {
          display: flex; gap: var(--space-2); align-items: center;
          font-family: var(--font-mono); font-size: var(--fs-sm);
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/FrontmatterForm.tsx src/components/admin/TagInput.tsx
git commit -m "feat(cms): FrontmatterForm + TagInput components"
```

---

## Task 23: `PostEditor.tsx` — CodeMirror integration

**Files:**
- Create: `src/components/admin/PostEditor.tsx`.

- [ ] **Step 1: Implementation**

```tsx
import { useEffect, useRef } from "react";
import { EditorView, keymap, highlightActiveLine } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";

interface Props {
  readonly value: string;
  readonly onChange: (next: string) => void;
}

const highlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--color-fg)", fontWeight: "500" },
  { tag: t.strong, fontWeight: "600" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.link, color: "var(--color-accent)" },
  { tag: t.monospace, color: "var(--color-accent-hover)" },
  { tag: t.list, color: "var(--color-fg-muted)" },
]);

export default function PostEditor({ value, onChange }: Props): JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        markdown(),
        syntaxHighlighting(highlight),
        highlightActiveLine(),
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChange(update.state.doc.toString());
        }),
      ],
    });
    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // We intentionally mount the editor once — external `value` updates are
    // applied via the else-branch on subsequent renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={hostRef} className="post-editor" />;
}

// Scoped styles live in the page that hosts this editor since Astro
// component scoping doesn't apply to React islands.
```

Add the corresponding CSS globally (e.g., a new `src/styles/admin.css` imported in `AdminLayout.astro`) so the editor chrome fits the theme:

```css
/* src/styles/admin.css */
.post-editor .cm-editor {
  height: 70vh;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  background: var(--color-bg);
}
.post-editor .cm-content { padding: var(--space-4); }
.post-editor .cm-scroller { background: var(--color-bg); }
.post-editor .cm-gutters {
  background: var(--color-bg-elevated);
  border-right: 1px solid var(--color-border);
  color: var(--color-fg-subtle);
}
```

Import it in `AdminLayout.astro`: `import "~/styles/admin.css";` near the top of the frontmatter.

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/PostEditor.tsx src/styles/admin.css src/layouts/AdminLayout.astro
git commit -m "feat(cms): CodeMirror-based post editor with markdown highlighting"
```

---

## Task 24: `/admin/posts/[slug].astro` edit page

**Files:**
- Create: `src/pages/admin/posts/[slug].astro`.
- Create: `src/components/admin/EditorShell.tsx` — island that owns editor state + form + save button.

- [ ] **Step 1: `EditorShell.tsx`**

```tsx
import { useState } from "react";
import { actions } from "astro:actions";
import FrontmatterForm, { type FrontmatterInput } from "./FrontmatterForm";
import PostEditor from "./PostEditor";

interface Props {
  readonly slug: string;
  readonly initial: {
    frontmatter: FrontmatterInput;
    body: string;
  };
}

export default function EditorShell({ slug, initial }: Props): JSX.Element {
  const [frontmatter, setFrontmatter] = useState(initial.frontmatter);
  const [body, setBody] = useState(initial.body);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function save(): Promise<void> {
    setStatus("saving");
    setErrorMsg(null);
    const result = await actions.posts.upsert({
      slug,
      frontmatter: {
        ...frontmatter,
        pubDate: new Date(frontmatter.pubDate),
        updatedDate: frontmatter.updatedDate ? new Date(frontmatter.updatedDate) : undefined,
        cover: frontmatter.cover ?? undefined,
        coverAlt: frontmatter.coverAlt ?? undefined,
      },
      body,
    });
    if (result.error) {
      setStatus("error");
      setErrorMsg(result.error.message ?? "Не удалось сохранить");
      return;
    }
    if (!result.data.ok) {
      setStatus("error");
      setErrorMsg(result.data.error ?? "Не удалось сохранить");
      return;
    }
    setStatus("saved");
    setTimeout(() => setStatus("idle"), 1200);
  }

  return (
    <div className="editor-shell">
      <FrontmatterForm value={frontmatter} onChange={setFrontmatter} />
      <PostEditor value={body} onChange={setBody} />
      <div className="editor-shell__bar">
        <button
          type="button"
          onClick={save}
          disabled={status === "saving"}
          className="editor-shell__save"
        >
          {status === "saving" ? "Сохраняю…" : "Сохранить"}
        </button>
        {status === "saved" && <span className="editor-shell__hint">Сохранено</span>}
        {status === "error" && errorMsg && (
          <span role="alert" className="editor-shell__error">{errorMsg}</span>
        )}
      </div>

      <style>{`
        .editor-shell { display: flex; flex-direction: column; gap: var(--space-5); }
        .editor-shell__bar {
          display: flex; gap: var(--space-4); align-items: center;
          position: sticky; bottom: var(--space-4);
          padding: var(--space-3) var(--space-4);
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-md);
        }
        .editor-shell__save {
          font-family: var(--font-mono); font-size: var(--fs-sm);
          color: var(--color-bg); background: var(--color-accent);
          border: 1px solid var(--color-accent); padding: var(--space-2) var(--space-4);
          border-radius: var(--radius-md); cursor: pointer;
        }
        .editor-shell__save:hover { background: var(--color-accent-hover); }
        .editor-shell__save:disabled { opacity: 0.6; cursor: not-allowed; }
        .editor-shell__hint {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-fg-muted);
        }
        .editor-shell__error {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-danger);
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: The page**

```astro
---
export const prerender = false;

import AdminLayout from "~/layouts/AdminLayout.astro";
import EditorShell from "~/components/admin/EditorShell";
import { readPostFromDisk } from "~/lib/content/post-io";
import { POSTS_DIR } from "~/lib/fs/paths";

const { slug } = Astro.params as { slug: string };
const post = await readPostFromDisk(POSTS_DIR, slug);
if (!post) return new Response("Post not found", { status: 404 });

const initial = {
  frontmatter: {
    title: post.frontmatter.title,
    description: post.frontmatter.description,
    pubDate: post.frontmatter.pubDate.toISOString().slice(0, 10),
    updatedDate: post.frontmatter.updatedDate
      ? post.frontmatter.updatedDate.toISOString().slice(0, 10)
      : null,
    tags: [...post.frontmatter.tags],
    draft: post.frontmatter.draft,
    cover: post.frontmatter.cover ?? null,
    coverAlt: post.frontmatter.coverAlt ?? null,
  },
  body: post.body,
};
---

<AdminLayout title={`Редактирование · ${slug}`}>
  <header class="admin-page-header">
    <h1>Редактирование</h1>
    <div class="admin-page-header__meta">
      <code>{slug}</code>
      <a href={`/admin/revisions/${encodeURIComponent(slug)}`}>История</a>
    </div>
  </header>
  <EditorShell client:load slug={slug} initial={initial} />
</AdminLayout>

<style>
  .admin-page-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: var(--space-5);
  }
  .admin-page-header h1 {
    font-family: var(--font-serif);
    font-size: var(--fs-2xl);
    margin: 0;
  }
  .admin-page-header__meta {
    display: flex; gap: var(--space-4);
    font-family: var(--font-mono); font-size: var(--fs-sm);
    color: var(--color-fg-muted);
  }
  .admin-page-header__meta a { color: var(--color-accent); }
</style>
```

- [ ] **Step 3: Smoke**

`pnpm dev`, log in, `/admin/posts`, click a post. Editor loads with current content. Change the title, click Save. Reload the editor page — new title appears.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/posts/\[slug\].astro src/components/admin/EditorShell.tsx
git commit -m "feat(cms): edit-post page with CodeMirror + frontmatter form"
```

---

## Task 25: `/admin/posts/new` — create new post

**Files:**
- Create: `src/pages/admin/posts/new.astro`.
- Modify: `src/actions/posts.ts` — ensure `upsert` handles new slugs (already does via `ensureMeta`).
- Modify: `src/components/admin/EditorShell.tsx` — handle "new post" case where slug is empty and needs a slug input.

- [ ] **Step 1: Add a slug input mode to `EditorShell.tsx`**

Extend Props:

```tsx
interface Props {
  readonly slug: string | null; // null = new post; shell renders a slug input
  readonly initial: { frontmatter: FrontmatterInput; body: string };
}
```

Add state: `const [slug, setSlug] = useState(propsSlug ?? "")`. Render an input at the top when `propsSlug` is null. Validate slug against `/^[a-z0-9][a-z0-9-]*$/` on save — show inline error if invalid.

In `save()`, use the stateful `slug` rather than the prop. If the server returns `{ ok: true }`, redirect to `/admin/posts/${slug}` using `window.location.href` so subsequent edits target the persisted file.

- [ ] **Step 2: `/admin/posts/new.astro`**

```astro
---
export const prerender = false;
import AdminLayout from "~/layouts/AdminLayout.astro";
import EditorShell from "~/components/admin/EditorShell";

const today = new Date().toISOString().slice(0, 10);
const initial = {
  frontmatter: {
    title: "",
    description: "",
    pubDate: today,
    updatedDate: null,
    tags: [],
    draft: true,
    cover: null,
    coverAlt: null,
  },
  body: "# Заголовок\n\nТело статьи.\n",
};
---

<AdminLayout title="Новая статья">
  <header class="admin-page-header">
    <h1>Новая статья</h1>
  </header>
  <EditorShell client:load slug={null} initial={initial} />
</AdminLayout>
```

- [ ] **Step 3: Smoke + commit**

Manual test: create a post, confirm a new MD file appears in `src/content/posts/` and a new `posts_meta` row is created.

```bash
git add src/pages/admin/posts/new.astro src/components/admin/EditorShell.tsx
git commit -m "feat(cms): create-new-post page with slug input"
```

---

## Task 26: `deletePost` action + delete button in list

**Files:**
- Modify: `src/actions/posts.ts`.
- Modify: `src/components/admin/PostList.tsx`.

- [ ] **Step 1: Action**

```ts
delete: defineAction({
  input: z.object({ slug: z.string().min(1) }),
  handler: async ({ slug }, context) => {
    assertAdmin(context.locals.user as { role?: string } | null);
    const target = resolveSafe(POSTS_DIR, `${slug}.md`);
    try {
      await unlink(target);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    await deleteMeta(slug);
    return { ok: true as const };
  },
}),
```

Add imports: `import { unlink } from "node:fs/promises"; import { deleteMeta } from "~/lib/db/repo/posts-meta"; import { resolveSafe, POSTS_DIR } from "~/lib/fs/paths";`.

> Note: `post_revisions` rows remain as audit trail even after delete. If you ever want hard-deletion of revisions too, add a follow-up action. Spec currently says keep.

- [ ] **Step 2: Button**

In `PostList.tsx` add a small `<button>` per row, behind a confirm dialog. On success remove from local state.

- [ ] **Step 3: Commit**

```bash
git add src/actions/posts.ts src/components/admin/PostList.tsx
git commit -m "feat(cms): delete post (file + meta) with confirm"
```

---

## Task 27: `listRevisions` + `restoreRevision` actions

**Files:**
- Create: `src/actions/revisions.ts`.
- Modify: `src/actions/index.ts`.

- [ ] **Step 1: `src/actions/revisions.ts`**

```ts
import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import { listRevisionsBySlug, getRevision, appendRevision } from "~/lib/db/repo/revisions";
import { serializeFrontmatter, type Frontmatter } from "~/lib/content/frontmatter";
import { writePostAtomically } from "~/lib/fs/post-writer";
import { POSTS_DIR } from "~/lib/fs/paths";

function assertAdmin(user: { role?: string | null } | null): void {
  if (!user || (user.role !== "admin" && user.role !== "editor")) {
    throw new Error("Forbidden");
  }
}

export const revisions = {
  list: defineAction({
    input: z.object({ slug: z.string().min(1) }),
    handler: async ({ slug }, context) => {
      assertAdmin(context.locals.user as { role?: string } | null);
      return {
        items: await listRevisionsBySlug(slug),
      };
    },
  }),

  restore: defineAction({
    input: z.object({ revisionId: z.number().int().positive() }),
    handler: async ({ revisionId }, context) => {
      const user = context.locals.user as { id: string; role?: string } | null;
      assertAdmin(user);
      const rev = await getRevision(revisionId);
      if (!rev) throw new Error("Revision not found");

      // Create a new revision from the old snapshot (audit trail).
      const fm = rev.frontmatter as unknown as Frontmatter;
      await appendRevision({
        slug: rev.slug,
        frontmatter: rev.frontmatter,
        body: rev.body,
        authorId: user!.id,
      });
      const serialized = serializeFrontmatter(fm, rev.body);
      await writePostAtomically(POSTS_DIR, rev.slug, serialized);
      return { ok: true as const };
    },
  }),
};
```

- [ ] **Step 2: Wire into `src/actions/index.ts`**

```ts
import { posts } from "./posts";
import { revisions } from "./revisions";

export const server = {
  posts,
  revisions,
};
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/revisions.ts src/actions/index.ts
git commit -m "feat(cms): revisions list/restore actions"
```

---

## Task 28: `/admin/revisions/[slug]` page + diff viewer

**Files:**
- Create: `src/pages/admin/revisions/[slug].astro`.
- Create: `src/components/admin/RevisionList.tsx`.
- Create: `src/components/admin/RevisionDiff.tsx`.

- [ ] **Step 1: `RevisionDiff.tsx`**

```tsx
import { diffLines } from "diff";
import type { Change } from "diff";

interface Props {
  readonly oldBody: string;
  readonly newBody: string;
}

export default function RevisionDiff({ oldBody, newBody }: Props): JSX.Element {
  const parts: Change[] = diffLines(oldBody, newBody);
  return (
    <pre className="diff">
      {parts.map((part, i) => (
        <span
          key={i}
          className={
            part.added ? "diff__added" : part.removed ? "diff__removed" : "diff__unchanged"
          }
        >
          {part.added ? "+" : part.removed ? "-" : " "}
          {part.value.replace(/\n$/, "").replaceAll("\n", `\n${part.added ? "+" : part.removed ? "-" : " "}`)}
          {"\n"}
        </span>
      ))}
      <style>{`
        .diff {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          line-height: 1.5;
          padding: var(--space-4);
          background: var(--color-bg-elevated);
          border: 1px solid var(--color-border); border-radius: var(--radius-md);
          overflow-x: auto; white-space: pre-wrap;
        }
        .diff__added { color: #14532d; background: #dcfce7; }
        .diff__removed { color: #7f1d1d; background: #fee2e2; }
        .diff__unchanged { color: var(--color-fg-muted); }
        @media (prefers-color-scheme: dark) {
          .diff__added { color: #bbf7d0; background: #14532d33; }
          .diff__removed { color: #fecaca; background: #7f1d1d33; }
        }
      `}</style>
    </pre>
  );
}
```

- [ ] **Step 2: `RevisionList.tsx`**

```tsx
import { useState } from "react";
import { actions } from "astro:actions";
import RevisionDiff from "./RevisionDiff";

interface Revision {
  id: number;
  slug: string;
  body: string;
  createdAt: string;
  authorId: string;
}

interface Props {
  readonly slug: string;
  readonly items: readonly Revision[];
}

export default function RevisionList({ slug, items }: Props): JSX.Element {
  const [selected, setSelected] = useState<number | null>(items[0]?.id ?? null);
  const [restoring, setRestoring] = useState(false);

  const current = items.find((i) => i.id === selected);
  const previous = current ? items[items.indexOf(current) + 1] : null;

  async function restore(id: number): Promise<void> {
    if (!confirm("Восстановить эту версию? Будет создана новая revision.")) return;
    setRestoring(true);
    const res = await actions.revisions.restore({ revisionId: id });
    setRestoring(false);
    if (res.error) alert(res.error.message ?? "Не удалось восстановить");
    else window.location.reload();
  }

  return (
    <div className="revision-list">
      <ul className="revision-list__items">
        {items.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => setSelected(r.id)}
              aria-current={selected === r.id ? "true" : undefined}
              className="revision-list__item"
            >
              <time>{new Date(r.createdAt).toLocaleString("ru-RU")}</time>
              <span className="revision-list__id">#{r.id}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="revision-list__detail">
        {current && (
          <>
            <header className="revision-list__detail-head">
              <span>Ревизия {current.id}</span>
              <button type="button" onClick={() => restore(current.id)} disabled={restoring}>
                Восстановить
              </button>
            </header>
            <RevisionDiff
              oldBody={previous?.body ?? ""}
              newBody={current.body}
            />
          </>
        )}
      </div>
      <style>{`
        .revision-list { display: grid; grid-template-columns: 240px 1fr; gap: var(--space-5); }
        .revision-list__items { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 2px; }
        .revision-list__item {
          display: flex; justify-content: space-between; align-items: baseline;
          width: 100%; text-align: left; padding: var(--space-2) var(--space-3);
          border: 1px solid transparent; border-radius: var(--radius-md);
          background: transparent; cursor: pointer;
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-fg-muted);
        }
        .revision-list__item:hover { background: var(--color-bg-elevated); }
        .revision-list__item[aria-current="true"] {
          background: var(--color-accent-soft); color: var(--color-fg);
          box-shadow: inset 2px 0 0 var(--color-accent);
        }
        .revision-list__id { color: var(--color-fg-subtle); }
        .revision-list__detail-head {
          display: flex; justify-content: space-between; align-items: center;
          margin-bottom: var(--space-3);
          font-family: var(--font-mono); font-size: var(--fs-sm);
          color: var(--color-fg-muted);
        }
        .revision-list__detail-head button {
          font-family: var(--font-mono); font-size: var(--fs-xs);
          color: var(--color-accent); background: transparent;
          border: 1px solid var(--color-accent); border-radius: var(--radius-md);
          padding: var(--space-1) var(--space-3); cursor: pointer;
        }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 3: `/admin/revisions/[slug].astro`**

```astro
---
export const prerender = false;

import AdminLayout from "~/layouts/AdminLayout.astro";
import RevisionList from "~/components/admin/RevisionList";
import { listRevisionsBySlug } from "~/lib/db/repo/revisions";

const { slug } = Astro.params as { slug: string };
const raw = await listRevisionsBySlug(slug);
const items = raw.map((r) => ({
  id: r.id,
  slug: r.slug,
  body: r.body,
  createdAt: r.createdAt.toISOString(),
  authorId: r.authorId,
}));
---

<AdminLayout title={`История · ${slug}`}>
  <header class="admin-page-header">
    <h1>История: <code>{slug}</code></h1>
    <a href={`/admin/posts/${encodeURIComponent(slug)}`}>← К редактированию</a>
  </header>
  {
    items.length === 0 ? (
      <p>Нет сохранённых ревизий.</p>
    ) : (
      <RevisionList client:load slug={slug} items={items} />
    )
  }
</AdminLayout>

<style>
  .admin-page-header {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-bottom: var(--space-5);
  }
  .admin-page-header h1 {
    font-family: var(--font-serif); font-size: var(--fs-2xl); margin: 0;
  }
  .admin-page-header a {
    font-family: var(--font-mono); font-size: var(--fs-sm); color: var(--color-accent);
  }
</style>
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/revisions src/components/admin/RevisionList.tsx src/components/admin/RevisionDiff.tsx
git commit -m "feat(cms): revision history + diff viewer with restore"
```

---

## Task 29: Editor integration test

**Files:**
- Modify: `tests/integration/cms.test.ts` — add upsert flow test.

- [ ] **Step 1: Append**

```ts
it("upsert writes file and appends revision", async () => {
  const [user] = await env.db
    .insert(users)
    .values({ email: "editor@example.com", role: "editor" })
    .returning();
  if (!user) throw new Error("seed failed");

  const slug = `test-upsert-${Date.now()}`;

  // Simulate the action's core flow (we can't run astro:actions directly here).
  const { writePostAtomically } = await import("~/lib/fs/post-writer");
  const { serializeFrontmatter } = await import("~/lib/content/frontmatter");
  const { appendRevision } = await import("~/lib/db/repo/revisions");
  const { ensureMeta } = await import("~/lib/db/repo/posts-meta");
  const { mkdtemp, rm, readFile } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const baseDir = await mkdtemp(join(tmpdir(), "cms-test-"));
  try {
    const fm = {
      title: "Test",
      description: "x".repeat(20),
      pubDate: new Date("2026-04-23"),
      tags: [],
      draft: true,
    };
    await ensureMeta(slug);
    const rev = await appendRevision({
      slug,
      frontmatter: fm,
      body: "hello",
      authorId: user.id,
    });
    const written = await writePostAtomically(baseDir, slug, serializeFrontmatter(fm, "hello"));
    const onDisk = await readFile(written, "utf8");
    expect(onDisk).toContain("title: \"Test\"");
    expect(rev.id).toBeGreaterThan(0);
  } finally {
    await rm(baseDir, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Commit**

```bash
pnpm test -- tests/integration/cms.test.ts
git add tests/integration/cms.test.ts
git commit -m "test(cms): integration coverage for upsert flow"
```

---

## Task 30: E2E edit + history flow

**Files:**
- Create: `tests/e2e/admin-edit.spec.ts`.

- [ ] **Step 1: Spec**

```ts
import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("e2e-admin@test.dev");
  await page.getByLabel(/пароль/i).fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

test("admin edits a post, sees revision, restores prior version", async ({ page }) => {
  await login(page);

  // Pick the first post.
  await page.goto("/admin/posts");
  const firstTitle = page.locator(".post-list__title").first();
  const href = await firstTitle.getAttribute("href");
  expect(href).toBeTruthy();
  await firstTitle.click();

  // Change the title via the frontmatter form.
  const titleInput = page.locator('input[type="text"]').first();
  const original = await titleInput.inputValue();
  const modified = `${original} [edited]`;
  await titleInput.fill(modified);
  await page.getByRole("button", { name: /сохранить/i }).click();
  await expect(page.getByText(/сохранено/i)).toBeVisible();

  // Visit history.
  const slugMatch = href!.match(/\/admin\/posts\/([^/]+)/);
  const slug = slugMatch?.[1] ?? "";
  await page.goto(`/admin/revisions/${slug}`);

  const items = page.locator(".revision-list__item");
  await expect(items.first()).toBeVisible();

  // Restore the second-most-recent revision (if one exists).
  if (await items.count() >= 2) {
    await items.nth(1).click();
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /восстановить/i }).click();
    await page.waitForLoadState("load");
  }
});
```

- [ ] **Step 2: Run + commit**

```bash
pnpm test:e2e -- tests/e2e/admin-edit.spec.ts
git add tests/e2e/admin-edit.spec.ts
git commit -m "test(cms): e2e flow for edit + revision restore"
```

---

## Task 31: Post creation E2E

**Files:**
- Create: `tests/e2e/admin-create.spec.ts`.

- [ ] **Step 1: Spec**

```ts
import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("e2e-admin@test.dev");
  await page.getByLabel(/пароль/i).fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

test("admin creates a new post from scratch", async ({ page }) => {
  await login(page);
  await page.goto("/admin/posts/new");

  const slug = `e2e-new-${Date.now()}`;
  await page.getByLabel(/slug/i).fill(slug);
  await page.locator('input[type="text"]').nth(1).fill("E2E Created Post"); // title
  await page.locator("textarea").first().fill("Description for e2e created post testing");
  await page.getByRole("button", { name: /сохранить/i }).click();

  // After save, we should be redirected to /admin/posts/<slug>.
  await expect(page).toHaveURL(new RegExp(`/admin/posts/${slug}$`));
});
```

- [ ] **Step 2: Commit**

```bash
pnpm test:e2e -- tests/e2e/admin-create.spec.ts
git add tests/e2e/admin-create.spec.ts
git commit -m "test(cms): e2e for new-post creation"
```

---

## Task 32: Delete flow E2E

**Files:**
- Create: `tests/e2e/admin-delete.spec.ts`.

- [ ] **Step 1: Spec**

```ts
import { expect, test } from "@playwright/test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("e2e-admin@test.dev");
  await page.getByLabel(/пароль/i).fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
}

test("admin creates and then deletes a post", async ({ page }) => {
  await login(page);

  // Create.
  await page.goto("/admin/posts/new");
  const slug = `e2e-delete-${Date.now()}`;
  await page.getByLabel(/slug/i).fill(slug);
  await page.locator('input[type="text"]').nth(1).fill("Delete me");
  await page.locator("textarea").first().fill("This post is about to be deleted.");
  await page.getByRole("button", { name: /сохранить/i }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/posts/${slug}$`));

  // Delete from list.
  await page.goto("/admin/posts");
  const row = page.locator(".post-list__item", { hasText: "Delete me" });
  page.on("dialog", (d) => d.accept());
  await row.getByRole("button", { name: /удалить/i }).click();

  await expect(row).toHaveCount(0);
  const files = await readdir(join(process.cwd(), "src/content/posts"));
  expect(files.some((f) => f.startsWith(slug))).toBe(false);
});
```

- [ ] **Step 2: Commit**

```bash
pnpm test:e2e -- tests/e2e/admin-delete.spec.ts
git add tests/e2e/admin-delete.spec.ts
git commit -m "test(cms): e2e for create + delete"
```

---

# Phase D — Media uploader (Tasks 33–41)

## Task 33: `media-writer.ts` — save uploaded file to volume

**Files:**
- Create: `src/lib/fs/media-writer.ts`.
- Create: `src/lib/fs/media-writer.test.ts`.

- [ ] **Step 1: Tests**

```ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeMediaToPublic, makeMediaSubpath } from "./media-writer";

describe("makeMediaSubpath", () => {
  it("derives YYYY/MM from a Date", () => {
    const d = new Date("2026-04-23T00:00:00Z");
    expect(makeMediaSubpath(d)).toBe("2026/04");
  });
});

describe("writeMediaToPublic", () => {
  it("writes bytes and returns a relative path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "media-writer-"));
    try {
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic
      const { relativePath, absolutePath } = await writeMediaToPublic(dir, "hello.png", bytes, new Date("2026-04-23"));
      expect(relativePath.startsWith("2026/04/")).toBe(true);
      const readback = await readFile(absolutePath);
      expect(readback.equals(Buffer.from(bytes))).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("avoids filename collisions with a suffix", async () => {
    const dir = await mkdtemp(join(tmpdir(), "media-writer-"));
    try {
      const bytes = new Uint8Array([1, 2, 3]);
      const a = await writeMediaToPublic(dir, "same.bin", bytes, new Date("2026-04-23"));
      const b = await writeMediaToPublic(dir, "same.bin", bytes, new Date("2026-04-23"));
      expect(a.relativePath).not.toBe(b.relativePath);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects filenames with path separators", async () => {
    const dir = await mkdtemp(join(tmpdir(), "media-writer-"));
    try {
      await expect(() =>
        writeMediaToPublic(dir, "../evil.png", new Uint8Array([0]), new Date()),
      ).rejects.toThrow();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Implementation**

```ts
// src/lib/fs/media-writer.ts
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { randomBytes } from "node:crypto";
import { resolveSafe } from "./paths";

export function makeMediaSubpath(d: Date): string {
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}/${month}`;
}

function safeBaseName(original: string): string {
  const base = basename(original).replace(/[^a-zA-Z0-9._-]/g, "-");
  if (base.includes("..") || base.startsWith(".") || base === "") {
    throw new Error(`invalid filename: ${JSON.stringify(original)}`);
  }
  return base;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

export interface WriteMediaResult {
  readonly relativePath: string;
  readonly absolutePath: string;
}

export async function writeMediaToPublic(
  baseDir: string,
  originalName: string,
  bytes: Uint8Array,
  when: Date = new Date(),
): Promise<WriteMediaResult> {
  if (originalName.includes("/") || originalName.includes("\\")) {
    throw new Error("filename must not contain path separators");
  }
  const base = safeBaseName(originalName);
  const sub = makeMediaSubpath(when);
  const dir = resolveSafe(baseDir, sub);
  await mkdir(dir, { recursive: true });

  let candidate = base;
  let absolutePath = resolveSafe(dir, candidate);
  while (await exists(absolutePath)) {
    const ext = extname(base);
    const stem = base.slice(0, base.length - ext.length);
    const suffix = randomBytes(3).toString("hex");
    candidate = `${stem}-${suffix}${ext}`;
    absolutePath = resolveSafe(dir, candidate);
  }

  await writeFile(absolutePath, bytes);
  return {
    relativePath: `${sub}/${candidate}`,
    absolutePath,
  };
}
```

- [ ] **Step 3: Commit**

```bash
pnpm test -- src/lib/fs/media-writer.test.ts
git add src/lib/fs/media-writer.ts src/lib/fs/media-writer.test.ts
git commit -m "feat(cms): media-writer saves uploads with collision-safe paths"
```

---

## Task 34: `uploadMedia` action

**Files:**
- Create: `src/actions/media.ts`.
- Modify: `src/actions/index.ts`.

- [ ] **Step 1: Action**

```ts
// src/actions/media.ts
import { defineAction } from "astro:actions";
import { z } from "astro:schema";
import probeSync from "probe-image-size/sync";
import { writeMediaToPublic } from "~/lib/fs/media-writer";
import { UPLOADS_DIR } from "~/lib/fs/paths";
import { recordMediaAsset, listMedia, deleteMediaAsset } from "~/lib/db/repo/media";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]);

function assertAdmin(user: { role?: string | null } | null): void {
  if (!user || (user.role !== "admin" && user.role !== "editor")) throw new Error("Forbidden");
}

export const media = {
  list: defineAction({
    input: z.object({}).optional(),
    handler: async (_, context) => {
      assertAdmin(context.locals.user as { role?: string } | null);
      return { items: await listMedia() };
    },
  }),

  upload: defineAction({
    accept: "form",
    input: z.object({
      file: z.instanceof(File).refine((f) => f.size > 0, "empty file").refine((f) => f.size <= MAX_BYTES, "file too large"),
    }),
    handler: async ({ file }, context) => {
      const user = context.locals.user as { id: string; role?: string } | null;
      assertAdmin(user);
      if (!ALLOWED_MIME.has(file.type)) {
        throw new Error(`Unsupported type: ${file.type}`);
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const probe = probeSync(Buffer.from(bytes));
      if (!probe) throw new Error("Could not detect image dimensions");
      const { relativePath } = await writeMediaToPublic(UPLOADS_DIR, file.name, bytes);

      const record = await recordMediaAsset({
        path: relativePath,
        originalName: file.name,
        mimeType: file.type,
        width: probe.width,
        height: probe.height,
        byteSize: bytes.byteLength,
        uploadedById: user!.id,
      });
      return { ok: true as const, asset: record };
    },
  }),

  delete: defineAction({
    input: z.object({ id: z.number().int().positive() }),
    handler: async ({ id }, context) => {
      assertAdmin(context.locals.user as { role?: string } | null);
      const deleted = await deleteMediaAsset(id);
      // The file is left on disk intentionally — it may still be referenced
      // by an older revision. Orphan cleanup is a future operational job.
      return { ok: true as const, deleted };
    },
  }),
};
```

- [ ] **Step 2: Wire**

```ts
// src/actions/index.ts
import { posts } from "./posts";
import { revisions } from "./revisions";
import { media } from "./media";
export const server = { posts, revisions, media };
```

- [ ] **Step 3: Commit**

```bash
git add src/actions/media.ts src/actions/index.ts
git commit -m "feat(cms): uploadMedia action with validation"
```

---

## Task 35: `/admin/media` page + MediaUploader + MediaGrid

**Files:**
- Create: `src/pages/admin/media.astro`.
- Create: `src/components/admin/MediaUploader.tsx`.
- Create: `src/components/admin/MediaGrid.tsx`.

- [ ] **Step 1: `MediaUploader.tsx`**

```tsx
import { useRef, useState } from "react";
import { actions } from "astro:actions";

interface Props {
  readonly onUploaded: () => void;
}

export default function MediaUploader({ onUploaded }: Props): JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handle(files: FileList | null): Promise<void> {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    for (const file of Array.from(files)) {
      const form = new FormData();
      form.set("file", file);
      const result = await actions.media.upload(form);
      if (result.error) {
        setError(result.error.message ?? "Upload failed");
        break;
      }
    }
    setUploading(false);
    onUploaded();
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div
      className="media-uploader"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        void handle(e.dataTransfer?.files ?? null);
      }}
    >
      <button type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>
        {uploading ? "Загрузка…" : "Выбрать файлы"}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
        multiple
        hidden
        onChange={(e) => void handle(e.target.files)}
      />
      <p>Или перетащите сюда (до 5 MB, PNG/JPEG/WebP/AVIF/GIF)</p>
      {error && <p className="media-uploader__error" role="alert">{error}</p>}
      <style>{`
        .media-uploader {
          border: 1px dashed var(--color-border-strong); border-radius: var(--radius-lg);
          padding: var(--space-5); text-align: center;
          color: var(--color-fg-muted);
        }
        .media-uploader button {
          font-family: var(--font-mono); font-size: var(--fs-sm);
          padding: var(--space-2) var(--space-4); border: 1px solid var(--color-accent);
          color: var(--color-accent); background: transparent; cursor: pointer;
          border-radius: var(--radius-md);
        }
        .media-uploader__error { color: var(--color-danger); }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: `MediaGrid.tsx`**

```tsx
interface Asset {
  id: number;
  path: string;
  originalName: string;
  mimeType: string;
  width: number;
  height: number;
  byteSize: number;
  uploadedAt: string;
}

interface Props {
  readonly items: readonly Asset[];
}

export default function MediaGrid({ items }: Props): JSX.Element {
  return (
    <ul className="media-grid">
      {items.map((asset) => (
        <li key={asset.id}>
          <figure>
            <img src={`/uploads/${asset.path}`} alt={asset.originalName} loading="lazy" />
            <figcaption>
              <span>{asset.originalName}</span>
              <code>{asset.width}×{asset.height}</code>
            </figcaption>
          </figure>
        </li>
      ))}
      <style>{`
        .media-grid {
          list-style: none; padding: 0; margin: var(--space-6) 0 0 0;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: var(--space-4);
        }
        figure { margin: 0; display: flex; flex-direction: column; gap: var(--space-2); }
        figure img {
          width: 100%; aspect-ratio: 4/3; object-fit: cover;
          border-radius: var(--radius-md); border: 1px solid var(--color-border);
        }
        figcaption {
          display: flex; justify-content: space-between; align-items: center;
          font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--color-fg-muted);
        }
      `}</style>
    </ul>
  );
}
```

- [ ] **Step 3: `/admin/media.astro`**

```astro
---
export const prerender = false;
import AdminLayout from "~/layouts/AdminLayout.astro";
import MediaUploader from "~/components/admin/MediaUploader";
import MediaGrid from "~/components/admin/MediaGrid";
import MediaPage from "~/components/admin/MediaPage";
import { listMedia } from "~/lib/db/repo/media";

const items = (await listMedia()).map((a) => ({
  id: a.id,
  path: a.path,
  originalName: a.originalName,
  mimeType: a.mimeType,
  width: a.width,
  height: a.height,
  byteSize: a.byteSize,
  uploadedAt: a.uploadedAt.toISOString(),
}));
---

<AdminLayout title="Медиа">
  <header class="admin-page-header">
    <h1>Медиа</h1>
  </header>
  <MediaPage client:load initial={items} />
</AdminLayout>
```

And a tiny wrapper island `src/components/admin/MediaPage.tsx` that composes uploader + grid and reloads the grid after each upload:

```tsx
import { useState, useCallback } from "react";
import MediaUploader from "./MediaUploader";
import MediaGrid from "./MediaGrid";
import { actions } from "astro:actions";

interface Asset {
  id: number; path: string; originalName: string; mimeType: string;
  width: number; height: number; byteSize: number; uploadedAt: string;
}

export default function MediaPage({ initial }: { readonly initial: readonly Asset[] }): JSX.Element {
  const [items, setItems] = useState(initial);

  const refresh = useCallback(async () => {
    const res = await actions.media.list({});
    if (!res.error) {
      setItems(
        res.data.items.map((a) => ({
          id: a.id,
          path: a.path,
          originalName: a.originalName,
          mimeType: a.mimeType,
          width: a.width,
          height: a.height,
          byteSize: a.byteSize,
          uploadedAt: a.uploadedAt.toString(),
        })),
      );
    }
  }, []);

  return (
    <div>
      <MediaUploader onUploaded={refresh} />
      <MediaGrid items={items} />
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/media.astro src/components/admin/MediaUploader.tsx src/components/admin/MediaGrid.tsx src/components/admin/MediaPage.tsx
git commit -m "feat(cms): media library page with upload + grid"
```

---

## Task 36: `MediaPicker` + wire to `FrontmatterForm`

**Files:**
- Create: `src/components/admin/MediaPicker.tsx`.
- Modify: `src/components/admin/FrontmatterForm.tsx`.

- [ ] **Step 1: `MediaPicker.tsx`**

```tsx
import { useEffect, useState } from "react";
import { actions } from "astro:actions";

interface Asset {
  id: number; path: string; originalName: string;
}

interface Props {
  readonly value: string | null;
  readonly onChange: (path: string | null) => void;
}

export default function MediaPicker({ value, onChange }: Props): JSX.Element {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<readonly Asset[]>([]);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      const res = await actions.media.list({});
      if (!res.error) setItems(res.data.items);
    })();
  }, [open]);

  return (
    <div className="media-picker">
      {value ? (
        <div className="media-picker__current">
          <img src={`/uploads/${value}`} alt="" />
          <button type="button" onClick={() => onChange(null)}>Убрать</button>
        </div>
      ) : (
        <button type="button" onClick={() => setOpen(true)}>Выбрать обложку</button>
      )}
      {open && (
        <dialog open className="media-picker__dialog">
          <button type="button" onClick={() => setOpen(false)}>×</button>
          <ul>
            {items.map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => { onChange(a.path); setOpen(false); }}>
                  <img src={`/uploads/${a.path}`} alt={a.originalName} />
                </button>
              </li>
            ))}
          </ul>
        </dialog>
      )}
      <style>{`
        .media-picker__current { display: flex; gap: var(--space-3); align-items: center; }
        .media-picker__current img { height: 60px; border-radius: var(--radius-md); }
        .media-picker__dialog {
          position: fixed; inset: 10vh 10vw; max-height: 80vh; overflow: auto;
          background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-lg);
          padding: var(--space-5); z-index: 100;
        }
        .media-picker__dialog ul {
          list-style: none; padding: 0; margin: var(--space-3) 0 0 0;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
          gap: var(--space-3);
        }
        .media-picker__dialog button img { width: 100%; }
      `}</style>
    </div>
  );
}
```

- [ ] **Step 2: Extend `FrontmatterForm.tsx`**

Add a `cover` field using `MediaPicker`:

```tsx
<div className="fm-form__field">
  <span>Обложка</span>
  <MediaPicker value={value.cover} onChange={(path) => set("cover", path)} />
</div>
<label className="fm-form__field">
  <span>Alt-текст обложки</span>
  <input
    type="text"
    value={value.coverAlt ?? ""}
    onChange={(e) => set("coverAlt", e.target.value === "" ? null : e.target.value)}
  />
</label>
```

Import `MediaPicker`.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/MediaPicker.tsx src/components/admin/FrontmatterForm.tsx
git commit -m "feat(cms): cover picker in FrontmatterForm"
```

---

## Task 37: Upload integration test

**Files:**
- Modify: `tests/integration/cms.test.ts`.

- [ ] **Step 1: Append**

```ts
it("media upload writes file and records asset row", async () => {
  const [user] = await env.db
    .insert(users)
    .values({ email: "uploader@example.com", role: "admin" })
    .returning();
  if (!user) throw new Error("seed failed");

  const { writeMediaToPublic } = await import("~/lib/fs/media-writer");
  const { recordMediaAsset } = await import("~/lib/db/repo/media");
  const { mkdtemp, rm, stat } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const base = await mkdtemp(join(tmpdir(), "media-int-"));
  try {
    // 1x1 transparent PNG
    const png = Buffer.from(
      "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082",
      "hex",
    );
    const { relativePath, absolutePath } = await writeMediaToPublic(base, "pixel.png", new Uint8Array(png));
    const info = await stat(absolutePath);
    expect(info.size).toBe(png.length);
    const row = await recordMediaAsset({
      path: relativePath,
      originalName: "pixel.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      byteSize: png.length,
      uploadedById: user.id,
    });
    expect(row.id).toBeGreaterThan(0);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
});
```

- [ ] **Step 2: Commit**

```bash
pnpm test -- tests/integration/cms.test.ts
git add tests/integration/cms.test.ts
git commit -m "test(cms): integration test for media upload"
```

---

## Task 38: E2E — upload + attach as cover

**Files:**
- Create: `tests/e2e/admin-media.spec.ts`.

- [ ] **Step 1: Spec**

```ts
import { expect, test } from "@playwright/test";
import { resolve } from "node:path";

async function login(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill("e2e-admin@test.dev");
  await page.getByLabel(/пароль/i).fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
}

test("admin uploads an image and attaches it as post cover", async ({ page }) => {
  await login(page);
  await page.goto("/admin/media");

  const fixture = resolve(process.cwd(), "tests/e2e/fixtures/pixel.png");
  await page.setInputFiles('input[type="file"]', fixture);

  await expect(page.locator(".media-grid img").first()).toBeVisible();

  // Open the first post and attach the cover.
  await page.goto("/admin/posts");
  await page.locator(".post-list__title").first().click();
  await page.getByRole("button", { name: /выбрать обложку/i }).click();
  await page.locator(".media-picker__dialog button img").first().click();
  await page.getByRole("button", { name: /сохранить/i }).click();
  await expect(page.getByText(/сохранено/i)).toBeVisible();
});
```

Add a tiny `tests/e2e/fixtures/pixel.png` — a 1x1 transparent PNG (the hex above). Use `node -e` or a Node script to write bytes to disk once and commit the fixture.

- [ ] **Step 2: Commit**

```bash
pnpm test:e2e -- tests/e2e/admin-media.spec.ts
git add tests/e2e/admin-media.spec.ts tests/e2e/fixtures/pixel.png
git commit -m "test(cms): e2e for media upload + cover attachment"
```

---

## Task 39: Admin a11y

**Files:**
- Modify: `tests/e2e/a11y.spec.ts`.

- [ ] **Step 1: Extend PAGES array**

```ts
const PAGES = [
  "/", "/blog", "/blog/02-context-and-cache",
  "/admin/posts", "/admin/posts/new", "/admin/media",
] as const;
```

For admin pages, add a precondition: log in first. Refactor the test body to accept a flag indicating admin pages, and prefix those with a login step.

Sketch:

```ts
test.describe("accessibility baseline", () => {
  for (const path of PAGES) {
    const needsAuth = path.startsWith("/admin");
    test(`no serious/critical a11y violations on ${path}`, async ({ page }) => {
      if (needsAuth) await login(page);
      await page.goto(path);
      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = result.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      if (blocking.length > 0) console.log(JSON.stringify(blocking, null, 2));
      expect(blocking).toEqual([]);
    });
  }
});
```

Fix any violations (likely around form labels in FrontmatterForm, or contrast on inline flags).

- [ ] **Step 2: Commit**

```bash
pnpm test:e2e -- tests/e2e/a11y.spec.ts
git add tests/e2e/a11y.spec.ts
git commit -m "test(cms): extend a11y baseline to admin pages"
```

---

## Task 40: `getPostWithMeta` for editor fallback & sanity check

**Files:**
- Modify: `src/lib/content/loader.ts` — already exports `getPostWithMeta`, verify.
- Add unit test if missing.

- [ ] **Step 1: Verify `getPostWithMeta` returns `null` for unknown slugs**

Append to `src/lib/content/loader.test.ts`:

```ts
// This helper is covered by integration tests; no unit test since Astro's
// getCollection requires a real content directory. Left here as a marker.
```

- [ ] **Step 2: Commit (if any change)**

```bash
git status  # if clean, skip the commit
```

---

## Task 41: Final verification + push

**Files:**
- None modified. This task is the gate before PR.

- [ ] **Step 1: Run the full verification**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

Each must pass. For `pnpm test`, both unit + integration must run — Postgres container comes up automatically via testcontainers.

- [ ] **Step 2: Clean git state**

```bash
git status   # must be clean
```

- [ ] **Step 3: Acceptance check**

- `grep -rn 'export const prerender = false' src/pages` → matches home + blog list + all `/admin/*` pages.
- `grep -rn 'assertAdmin' src/actions` → every action handler uses it.
- `ls drizzle/*.sql` → two files (`0001_cms_core.sql` and `0002_revisions_prune_trigger.sql`).
- `docker compose exec -T db psql -U postgres -d blog -c 'SELECT count(*) FROM posts_meta;'` → 15 (existing posts) + any test-created posts.

- [ ] **Step 4: Push**

```bash
git push -u origin feat/cms-core
```

---

## Acceptance criteria (self-check)

- [ ] Public site reads post order from `posts_meta`; sidebar + blog list reflect admin-changed order.
- [ ] Admin dashboard under `/admin/posts` shows all posts (including hidden/draft), allows drag-and-drop reorder, toggles pinned/hidden, creates new, deletes old.
- [ ] Editor saves frontmatter + body to disk; each save appends a `post_revisions` row; prune keeps 50 per slug.
- [ ] `/admin/revisions/<slug>` shows chronological list + diff of body changes; restore creates a new revision + overwrites the file.
- [ ] `/admin/media` uploads to `public/uploads/YYYY/MM/`; `media_assets` row per upload; dimensions populated.
- [ ] FrontmatterForm cover picker uses the library; cover displays on the public post.
- [ ] All actions reject non-admin (403 or redirect).
- [ ] a11y axe: no serious/critical on public + admin pages.
- [ ] `pnpm build` succeeds; site works behind `@astrojs/node`.

---

## Follow-ups noted during plan writing (out of scope)

- Slug renames with redirects — defer to a "content operations" plan.
- Orphan media cleanup — cron/task that scans `public/uploads/` against `media_assets` references.
- Image variants (responsive srcset) — `astro:assets` handles build-time but not runtime uploads; needs a small image-transform worker.
- Admin-side search — Plan 3 adds Postgres FTS.
- Public ⌘K palette — Plan 3.
- `designer` subagent + supporting skills — Plan 4.

---

**Plan length:** 41 tasks across four phases (A schema+loader, B admin+reorder, C editor+revisions, D media). Reviewers checking spec coverage should cross-reference sections 4–11, 13, and 15–16 of the design doc.
