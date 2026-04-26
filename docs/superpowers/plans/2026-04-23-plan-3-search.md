# Plan 3 — Search Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add hybrid search to the blog: Postgres FTS for admin (live, filters drafts) + Pagefind static index for public visitors (`⌘K` palette and SSR `/search` fallback).

**Architecture:** `posts_meta.search_vector tsvector` is updated in the same transaction as the upsert and indexed by GIN. Public side ships a Pagefind index built post-`astro build`; admin actions schedule a debounced (30s, per-slug) rebuild that runs `pagefind` against `dist/`. `cmdk` provides the palette UX; `@pagefind/default-ui` is intentionally **not** used — we render results with our own design tokens.

**Tech Stack:** pagefind v1 (CLI + browser WASM), cmdk v1, Postgres FTS (`simple` dictionary + `unaccent`), Drizzle ORM transactions, Astro 5 server actions, React 19 islands.

---

## Conventions

- All new server-side files go under `src/lib/search/`.
- All new client components under `src/components/search/`.
- All new server pages under `src/pages/search.astro` (public) — admin search lives inside `src/components/admin/PostList.tsx` (existing).
- Tests go under `tests/unit/search/`, `tests/integration/search/`, `tests/e2e/search.spec.ts`.
- Every step that runs a command shows the **exact** command and **expected** result.
- The implementer must use Sonnet unless the task description says otherwise; reviewer subagents may use Opus.
- Commit after each task with conventional message (`feat(search): …`, `test(search): …`, `chore(search): …`, `fix(search): …`).
- Branch: `feat/cms-core` (continuation; merge to `main` after Plan 3 is complete).

## Phase map

- **Phase A (Tasks 1–4):** Dependencies, `search_vector` column + GIN index + `unaccent` extension, pure tsvector SQL builder.
- **Phase B (Tasks 5–10):** Wire vector update into `posts.upsert`, backfill, repo + action for admin search, search UI in `PostList`.
- **Phase C (Tasks 11–14):** Pagefind CLI, `pagefind:rebuild` script, debounced scheduler, hook into upsert/delete actions.
- **Phase D (Tasks 15–19):** `CommandPalette.tsx` React island with `cmdk` + Pagefind WASM, ⌘K shortcut, header search button.
- **Phase E (Tasks 20–22):** `/search` SSR fallback page using Pagefind Node API.
- **Phase F (Tasks 23–28):** E2E + a11y baseline + final cleanup.

---

## Phase A — Infrastructure

### Task 1: Install dependencies

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml` (auto)

- [ ] **Step 1: Install `pagefind`, `cmdk`, and `@types/node`-compatible Pagefind types**

Run from project root:

```bash
pnpm add pagefind cmdk
```

Expected: `pagefind` and `cmdk` appear in `dependencies` with versions resolving to `^1`. `pnpm-lock.yaml` updated.

- [ ] **Step 2: Verify pagefind CLI is callable**

```bash
pnpm exec pagefind --version
```

Expected: prints a version string starting with `1.` and exits 0. If it fails, the binary did not install for the current platform — re-run `pnpm install` and confirm `node_modules/pagefind/lib` exists.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(search): add pagefind and cmdk"
```

---

### Task 2: Drizzle migration — add `search_vector` column + GIN index + `unaccent`

**Files:**
- Modify: `src/lib/db/schema.ts:92-105`
- Create: `drizzle/0003_search_vector.sql` (generated, then hand-edited)

- [ ] **Step 1: Add `searchVector` column to `postsMeta` schema**

Modify `src/lib/db/schema.ts`. At the top of the file, add to the imports:

```ts
import { customType } from "drizzle-orm/pg-core";
```

Add a `tsvector` custom type definition after the imports block (before the table declarations):

```ts
const tsvector = customType<{ data: string; driverData: string }>({
  dataType: () => "tsvector",
});
```

Modify the `postsMeta` table to add the column:

```ts
export const postsMeta = pgTable(
  "posts_meta",
  {
    slug: text("slug").primaryKey(),
    order: integer("order").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    hiddenFromList: boolean("hidden_from_list").notNull().default(false),
    searchVector: tsvector("search_vector"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orderIdx: index("posts_meta_order_idx").on(t.order),
    pinnedIdx: index("posts_meta_pinned_idx").on(t.pinned),
  }),
);
```

- [ ] **Step 2: Generate migration**

```bash
pnpm db:generate
```

Expected: a new file `drizzle/0003_*.sql` is produced. Rename it to `drizzle/0003_search_vector.sql` and update `drizzle/meta/_journal.json` accordingly (drizzle-kit usually does this automatically; verify).

- [ ] **Step 3: Hand-edit migration to add GIN index + `unaccent` extension**

Edit `drizzle/0003_search_vector.sql`. The generated content adds the column. Append:

```sql
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS posts_meta_search_vector_idx ON "posts_meta" USING GIN ("search_vector");
```

- [ ] **Step 4: Apply migration**

```bash
pnpm exec tsx src/lib/db/migrate.ts
```

Expected: prints `Migrations applied` and exits 0. If `unaccent` extension creation fails with `permission denied`, re-run as the postgres superuser via:

```bash
docker exec astro-blog-postgres psql -U blog -d blog -c "CREATE EXTENSION IF NOT EXISTS unaccent;"
```

- [ ] **Step 5: Verify column + index exist**

```bash
docker exec astro-blog-postgres psql -U blog -d blog -c "\d posts_meta"
```

Expected output includes `search_vector | tsvector` and an entry `posts_meta_search_vector_idx` under indexes.

- [ ] **Step 6: Commit**

```bash
git add src/lib/db/schema.ts drizzle/0003_search_vector.sql drizzle/meta/
git commit -m "feat(search): posts_meta.search_vector column + GIN index + unaccent"
```

---

### Task 3: Pure tsvector builder

**Files:**
- Create: `src/lib/search/vector.ts`
- Create: `tests/unit/search/vector.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/search/vector.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildSearchVectorSql } from "~/lib/search/vector";

describe("buildSearchVectorSql", () => {
  it("weights title A, tags B, body C", () => {
    const sql = buildSearchVectorSql({
      title: "Hello world",
      tags: ["astro", "blog"],
      body: "First post body",
    });
    // Returns a Drizzle SQL fragment; serialize via toString() for inspection.
    const text = sql.toString();
    expect(text).toContain("setweight");
    expect(text).toContain("'A'");
    expect(text).toContain("'B'");
    expect(text).toContain("'C'");
    expect(text).toContain("unaccent");
    expect(text).toContain("'simple'");
  });

  it("handles empty tags array", () => {
    const sql = buildSearchVectorSql({ title: "T", tags: [], body: "B" });
    expect(sql.toString()).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/search/vector.test.ts
```

Expected: FAIL with module-not-found for `~/lib/search/vector`.

- [ ] **Step 3: Implement `buildSearchVectorSql`**

Create `src/lib/search/vector.ts`:

```ts
import { sql, type SQL } from "drizzle-orm";

export interface SearchVectorParts {
  readonly title: string;
  readonly tags: readonly string[];
  readonly body: string;
}

/**
 * Builds an SQL fragment that produces a weighted tsvector from
 * title (A), tags joined with spaces (B), and body (C). All input
 * is passed through unaccent() for diacritic-insensitive matching.
 *
 * Use as the value for postsMeta.searchVector in an UPDATE/INSERT.
 */
export function buildSearchVectorSql(parts: SearchVectorParts): SQL {
  const tagsString = parts.tags.join(" ");
  return sql`
    setweight(to_tsvector('simple', unaccent(${parts.title})), 'A') ||
    setweight(to_tsvector('simple', unaccent(${tagsString})), 'B') ||
    setweight(to_tsvector('simple', unaccent(${parts.body})), 'C')
  `;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
pnpm test tests/unit/search/vector.test.ts
```

Expected: PASS, 2/2.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/vector.ts tests/unit/search/vector.test.ts
git commit -m "feat(search): pure tsvector builder for posts_meta.search_vector"
```

---

### Task 4: Phase A checkpoint — typecheck + tests

- [ ] **Step 1: Run typecheck**

```bash
pnpm typecheck
```

Expected: PASS. If `customType` import fails, confirm it is exported from `drizzle-orm/pg-core` in the installed version (`pnpm list drizzle-orm`).

- [ ] **Step 2: Run all unit tests**

```bash
pnpm test
```

Expected: PASS for everything previously green plus new `vector.test.ts`.

- [ ] **Step 3: No commit (this is a verification step).**

---

## Phase B — Admin Postgres FTS

### Task 5: Wire `search_vector` update into `posts.upsert`

**Files:**
- Modify: `src/lib/db/repo/posts-meta.ts`
- Modify: `src/actions/posts.ts:84-103`

- [ ] **Step 1: Add `setSearchVector` repo function**

Append to `src/lib/db/repo/posts-meta.ts`:

```ts
import { buildSearchVectorSql, type SearchVectorParts } from "~/lib/search/vector";

export async function setSearchVector(slug: string, parts: SearchVectorParts): Promise<void> {
  await db
    .update(postsMeta)
    .set({ searchVector: buildSearchVectorSql(parts) as unknown as string })
    .where(eq(postsMeta.slug, slug));
}
```

(The `as unknown as string` cast bridges Drizzle's typed column setter to a raw SQL fragment; this is the established pattern for tsvector updates.)

- [ ] **Step 2: Hook into `posts.upsert` after the revision write**

In `src/actions/posts.ts`, modify the `upsert` handler. After the existing `await appendRevision(...)` call and **inside the same try block where the file write happens**, add the search vector update. The handler becomes:

```ts
import { setSearchVector } from "~/lib/db/repo/posts-meta";
import { schedulePagefindRebuild } from "~/lib/search/pagefind-rebuild"; // added in Task 13

// ... inside handler:

// Step 1: DB transaction — insert revision.
const revision = await appendRevision({
  slug: input.slug,
  frontmatter: fmObject,
  body: input.body,
  authorId: user!.id,
});

// Step 1b: Update FTS vector (separate statement; cheap and idempotent).
await setSearchVector(input.slug, {
  title: input.frontmatter.title,
  tags: input.frontmatter.tags,
  body: input.body,
});

// Step 2: Serialize + atomic file write.
const serialized = serializeFrontmatter(fmObject, input.body);
try {
  await writePostAtomically(POSTS_DIR, input.slug, serialized);
} catch (err) {
  return {
    ok: false as const,
    revisionId: revision.id,
    error: `File write failed; revision ${revision.id} preserves the intended content.`,
  };
}

// Step 3: Schedule pagefind rebuild (no-op in dev).
schedulePagefindRebuild(input.slug);

return { ok: true as const, revisionId: revision.id, order: meta.order };
```

**Note:** the `schedulePagefindRebuild` import will not exist until Task 12 (and is wired into the action in Task 13). To keep the codebase compilable through Phase B, **defer adding the schedulePagefindRebuild import + call** until Task 13. For Task 5 add only `setSearchVector` and its call.

Final Task 5 handler change is ONLY:
1. Import `setSearchVector`.
2. After `appendRevision`, call `setSearchVector(input.slug, {...})`.

- [ ] **Step 3: Typecheck + run existing integration tests**

```bash
pnpm typecheck && pnpm test tests/integration/cms.test.ts
```

Expected: PASS. If integration tests fail because the test DB does not have the `unaccent` extension, the testcontainers Postgres image must run the migration first — verify `tests/integration/setup.ts` already calls the migration runner (it does; Task 2's migration will be applied automatically).

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/repo/posts-meta.ts src/actions/posts.ts
git commit -m "feat(search): update search_vector on posts.upsert"
```

---

### Task 6: Backfill `search_vector` for existing rows

**Files:**
- Create: `scripts/backfill-search-vector.ts`
- Modify: `package.json` (add script)

- [ ] **Step 1: Write backfill script**

Create `scripts/backfill-search-vector.ts`:

```ts
#!/usr/bin/env tsx
import "dotenv/config";
import { db } from "../src/lib/db/index.ts";
import { postsMeta } from "../src/lib/db/schema.ts";
import { listPostFiles, readPostFromDisk } from "../src/lib/content/post-io.ts";
import { setSearchVector } from "../src/lib/db/repo/posts-meta.ts";

async function main(): Promise<void> {
  const files = await listPostFiles();
  let updated = 0;
  for (const file of files) {
    const slug = file.slug;
    const post = await readPostFromDisk(slug);
    if (!post) {
      console.warn(`skip ${slug}: read failed`);
      continue;
    }
    await setSearchVector(slug, {
      title: post.frontmatter.title,
      tags: post.frontmatter.tags ?? [],
      body: post.body,
    });
    updated += 1;
  }
  console.log(`backfilled search_vector for ${updated} posts`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

If `listPostFiles` / `readPostFromDisk` signatures differ, read `src/lib/content/post-io.ts` and adapt — do not invent fields.

- [ ] **Step 2: Add `db:backfill-search` to package.json scripts**

In `package.json`, add to `scripts`:

```json
"db:backfill-search": "tsx scripts/backfill-search-vector.ts",
```

- [ ] **Step 3: Run backfill**

```bash
pnpm db:backfill-search
```

Expected: `backfilled search_vector for 15 posts` (or however many posts currently exist). Exit 0.

- [ ] **Step 4: Verify in DB**

```bash
docker exec astro-blog-postgres psql -U blog -d blog -c "SELECT slug, length(search_vector::text) > 0 AS has_vec FROM posts_meta LIMIT 5;"
```

Expected: every row shows `has_vec = t`.

- [ ] **Step 5: Commit**

```bash
git add scripts/backfill-search-vector.ts package.json
git commit -m "chore(search): backfill search_vector for existing posts"
```

---

### Task 7: `searchPostsMeta` repo function

**Files:**
- Modify: `src/lib/db/repo/posts-meta.ts`
- Create: `tests/integration/search/admin-search.test.ts`

- [ ] **Step 1: Append `searchPostsMeta` to repo**

In `src/lib/db/repo/posts-meta.ts`:

```ts
export interface SearchHit {
  readonly slug: string;
  readonly rank: number;
}

export async function searchPostsMeta(query: string, limit = 20): Promise<readonly SearchHit[]> {
  if (query.trim().length === 0) return [];
  const rows = await db.execute<{ slug: string; rank: number }>(sql`
    SELECT slug,
           ts_rank_cd(search_vector, websearch_to_tsquery('simple', unaccent(${query}))) AS rank
    FROM posts_meta
    WHERE search_vector @@ websearch_to_tsquery('simple', unaccent(${query}))
    ORDER BY rank DESC
    LIMIT ${limit}
  `);
  return rows.map((r) => ({ slug: r.slug, rank: Number(r.rank) }));
}
```

(Drizzle `db.execute` returns either `{ rows: [...] }` or `[...]` depending on the driver shape; verify against `src/lib/db/index.ts`. With `postgres-js`, `db.execute(sql\`...\`)` returns the rows array directly. If `rows.map` errors, use `(rows as { slug: string; rank: number }[]).map`.)

- [ ] **Step 2: Write failing integration test**

Create `tests/integration/search/admin-search.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { setupTestDb, teardownTestDb } from "../setup";
import { db } from "~/lib/db";
import { postsMeta } from "~/lib/db/schema";
import { setSearchVector, searchPostsMeta } from "~/lib/db/repo/posts-meta";

describe("admin search (postgres FTS)", () => {
  beforeAll(async () => {
    await setupTestDb();
    // seed three posts
    await db.insert(postsMeta).values([
      { slug: "a", order: 1 },
      { slug: "b", order: 2 },
      { slug: "c", order: 3 },
    ]);
    await setSearchVector("a", {
      title: "Astro components",
      tags: ["astro", "frontend"],
      body: "Working with island components in Astro 5.",
    });
    await setSearchVector("b", {
      title: "Postgres tuning",
      tags: ["postgres", "database"],
      body: "Indexing strategies for tsvector columns.",
    });
    await setSearchVector("c", {
      title: "Привет мир",
      tags: ["meta"],
      body: "Кириллица и поиск без стемминга.",
    });
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  it("ranks title matches above body matches", async () => {
    const hits = await searchPostsMeta("astro");
    expect(hits[0]?.slug).toBe("a");
  });

  it("matches Russian without stemming", async () => {
    const hits = await searchPostsMeta("кириллица");
    expect(hits.map((h) => h.slug)).toContain("c");
  });

  it("is accent-insensitive", async () => {
    // "tsvector" is ascii; use a French-style query against an English body to exercise unaccent
    const hits = await searchPostsMeta("Привет");
    expect(hits.map((h) => h.slug)).toContain("c");
  });

  it("returns [] for empty query", async () => {
    const hits = await searchPostsMeta("   ");
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 3: Run test**

```bash
pnpm test tests/integration/search/admin-search.test.ts
```

Expected: PASS, 4/4. If `searchPostsMeta` returns nothing for the Russian query, verify the migration installed `unaccent` against the test container — `setupTestDb` runs the same migration runner used in dev.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/repo/posts-meta.ts tests/integration/search/admin-search.test.ts
git commit -m "feat(search): admin FTS search via websearch_to_tsquery + ts_rank_cd"
```

---

### Task 8: `posts.search` server action

**Files:**
- Modify: `src/actions/posts.ts`

- [ ] **Step 1: Add `search` action**

After the existing `delete` action in `src/actions/posts.ts`, add:

```ts
import { searchPostsMeta } from "~/lib/db/repo/posts-meta";

// ... in the `posts` object:

  search: defineAction({
    input: z.object({
      query: z.string().max(200),
    }),
    handler: async ({ query }, context) => {
      assertAdmin(context.locals.user as { role?: string | null } | null);
      const hits = await searchPostsMeta(query, 50);
      return { ok: true as const, hits };
    },
  }),
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/actions/posts.ts
git commit -m "feat(search): posts.search admin action"
```

---

### Task 9: Admin search UI in `PostList`

**Files:**
- Modify: `src/components/admin/PostList.tsx`

- [ ] **Step 1: Add filter state + debounced search**

The existing `PostList.tsx` renders a sortable list of `PostListItem[]`. Add a search input above the list that, when populated, **filters the rendered list** to slugs returned from `posts.search`. When empty, show the full sortable list.

The minimal changes:

1. Import `actions` and `useEffect`, `useState` (already there for sortable state).
2. Add state:

```tsx
const [query, setQuery] = useState("");
const [filteredSlugs, setFilteredSlugs] = useState<readonly string[] | null>(null);
```

3. Debounced effect that calls the action when `query` changes (300ms):

```tsx
useEffect(() => {
  if (query.trim().length === 0) {
    setFilteredSlugs(null);
    return;
  }
  const handle = window.setTimeout(async () => {
    const { data, error } = await actions.posts.search({ query });
    if (error || !data?.ok) return;
    setFilteredSlugs(data.hits.map((h) => h.slug));
  }, 300);
  return () => window.clearTimeout(handle);
}, [query]);
```

4. Render a search input above the list:

```tsx
<div className="post-list__search">
  <input
    type="search"
    placeholder="Поиск по заголовку, тегам, тексту…"
    value={query}
    onChange={(e) => setQuery(e.target.value)}
    aria-label="Поиск постов"
  />
</div>
```

5. When `filteredSlugs !== null`, derive a filtered list (preserve original order in `items`):

```tsx
const visibleItems = filteredSlugs
  ? items.filter((it) => filteredSlugs.includes(it.slug))
  : items;
```

Render `visibleItems` instead of `items`. **Do not** pass `visibleItems` as the dnd-kit `SortableContext` items — keep dnd-kit on the full `items` so dragging still works. Apply the filter only to the visible mapped JSX. (Simpler alternative: disable drag handles when a filter is active; pick whichever lands cleaner — implementer's call. Document the choice in the commit message.)

- [ ] **Step 2: Add minimal styles for the search input**

Add a small CSS block to `PostList.tsx`'s associated stylesheet (whatever file it currently uses; probably inline styles or the same module). Mirror the existing `--input-*` tokens already in `tokens.css`.

- [ ] **Step 3: Manually verify in dev**

```bash
pnpm dev
```

Then visit `http://localhost:4321/admin/posts` (after logging in), type a query, and confirm:
- Empty query: full list, draggable.
- Non-empty query: filtered list.
- Russian queries work.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/PostList.tsx
git commit -m "feat(search): admin search input filters PostList via posts.search action"
```

---

### Task 10: Phase B checkpoint

- [ ] **Step 1: Full typecheck + lint + tests**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: all PASS. Address regressions; do not move to Phase C until green.

- [ ] **Step 2: No commit unless fixes were needed.**

---

## Phase C — Pagefind public index + rebuild scheduler

### Task 11: Build script + post-build hook

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `pagefind:rebuild` and `build` script changes**

In `package.json`, change:

```json
"build": "astro build",
```

to:

```json
"build": "astro build && pnpm pagefind:rebuild",
"pagefind:rebuild": "pagefind --site dist --output-subdir pagefind",
```

- [ ] **Step 2: Run a fresh build to confirm Pagefind indexes the site**

```bash
pnpm build
```

Expected: Astro builds, then Pagefind runs and writes files to `dist/pagefind/`. Verify:

```bash
ls dist/pagefind/
```

Expected: includes `pagefind.js`, `pagefind-ui.css` (no — we don't use the default UI; expect `pagefind.js`, `pagefind-modular-ui.js`, language `wasm` files, fragment files). Specifically `pagefind.js` and at least one `*.wasm` file must exist.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(search): add pagefind:rebuild script + wire into build"
```

---

### Task 12: Pagefind rebuild scheduler (debounced, no-op in dev)

**Files:**
- Create: `src/lib/search/pagefind-rebuild.ts`
- Create: `tests/unit/search/pagefind-rebuild.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/unit/search/pagefind-rebuild.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSpawn = vi.fn();
vi.mock("node:child_process", () => ({
  spawn: mockSpawn,
}));

const mockExistsSync = vi.fn(() => true);
vi.mock("node:fs", () => ({
  existsSync: mockExistsSync,
}));

import {
  schedulePagefindRebuild,
  __testReset,
  REBUILD_DEBOUNCE_MS,
} from "~/lib/search/pagefind-rebuild";

describe("schedulePagefindRebuild", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockSpawn.mockReset();
    mockSpawn.mockReturnValue({ on: vi.fn() });
    mockExistsSync.mockReturnValue(true);
    __testReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces multiple calls for the same slug", () => {
    schedulePagefindRebuild("post-a");
    schedulePagefindRebuild("post-a");
    schedulePagefindRebuild("post-a");
    vi.advanceTimersByTime(REBUILD_DEBOUNCE_MS - 1);
    expect(mockSpawn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("fires once per slug after debounce", () => {
    schedulePagefindRebuild("post-a");
    schedulePagefindRebuild("post-b");
    vi.advanceTimersByTime(REBUILD_DEBOUNCE_MS + 10);
    // Both slugs share a single rebuild — debounce is global, not per-slug.
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  it("no-ops when dist/ does not exist", () => {
    mockExistsSync.mockReturnValue(false);
    schedulePagefindRebuild("post-a");
    vi.advanceTimersByTime(REBUILD_DEBOUNCE_MS + 10);
    expect(mockSpawn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test tests/unit/search/pagefind-rebuild.test.ts
```

Expected: FAIL with module-not-found.

- [ ] **Step 3: Implement scheduler**

Create `src/lib/search/pagefind-rebuild.ts`:

```ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "~/lib/logger";

export const REBUILD_DEBOUNCE_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let pendingSlugs = new Set<string>();

const DIST_DIR = resolve(process.cwd(), "dist");

/**
 * Schedule a Pagefind rebuild against `dist/`. Calls within the debounce
 * window collapse into a single rebuild. No-op if `dist/` does not exist
 * (i.e., during `astro dev` without a prior `pnpm build`).
 */
export function schedulePagefindRebuild(slug: string): void {
  if (!existsSync(DIST_DIR)) {
    logger.debug({ slug }, "pagefind: skip rebuild — no dist/");
    return;
  }
  pendingSlugs.add(slug);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const slugs = [...pendingSlugs];
    pendingSlugs = new Set();
    timer = null;
    runRebuild(slugs);
  }, REBUILD_DEBOUNCE_MS);
}

function runRebuild(slugs: readonly string[]): void {
  logger.info({ slugs }, "pagefind: rebuilding");
  const child = spawn("pnpm", ["pagefind:rebuild"], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
  child.on("error", (err) => {
    logger.warn({ err }, "pagefind: rebuild spawn failed");
  });
  child.on("exit", (code) => {
    if (code !== 0) {
      logger.warn({ code }, "pagefind: rebuild exited non-zero");
    } else {
      logger.info("pagefind: rebuild ok");
    }
  });
}

/** Test-only: clears pending state. */
export function __testReset(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  pendingSlugs = new Set();
}
```

If `~/lib/logger` does not exist, replace with `console`. Verify the logger module exists:

```bash
ls src/lib/logger* 2>/dev/null || grep -rn "from \"~/lib/logger\"" src/ | head -3
```

If absent, use `import { logger } from "~/lib/log";` if that is the actual name, or just `console`.

- [ ] **Step 4: Run tests**

```bash
pnpm test tests/unit/search/pagefind-rebuild.test.ts
```

Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add src/lib/search/pagefind-rebuild.ts tests/unit/search/pagefind-rebuild.test.ts
git commit -m "feat(search): debounced pagefind rebuild scheduler"
```

---

### Task 13: Hook scheduler into upsert + delete actions

**Files:**
- Modify: `src/actions/posts.ts`

- [ ] **Step 1: Import + call from `upsert`**

In `src/actions/posts.ts`, add the import:

```ts
import { schedulePagefindRebuild } from "~/lib/search/pagefind-rebuild";
```

In the `upsert` handler, after the file write succeeds (right before `return { ok: true as const, ... }`), add:

```ts
schedulePagefindRebuild(input.slug);
```

In the `delete` handler, after the file deletion + `await deleteMeta(slug)`, add:

```ts
schedulePagefindRebuild(slug);
```

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/actions/posts.ts
git commit -m "feat(search): trigger pagefind rebuild on upsert + delete"
```

---

### Task 14: Phase C checkpoint

- [ ] **Step 1: Full typecheck + tests**

```bash
pnpm typecheck && pnpm test
```

Expected: PASS.

- [ ] **Step 2: Manual smoke test**

```bash
pnpm build
pnpm preview
```

Visit `http://localhost:4321/`. The page should render and `dist/pagefind/pagefind.js` should be reachable at `http://localhost:4321/pagefind/pagefind.js`.

```bash
curl -sI http://localhost:4321/pagefind/pagefind.js | head -1
```

Expected: `HTTP/1.1 200 OK`.

- [ ] **Step 3: No commit unless changes were required.**

---

## Phase D — Public command palette (⌘K)

### Task 15: Pagefind type stubs

**Files:**
- Modify: `src/env.d.ts`

- [ ] **Step 1: Add ambient module declaration for the Pagefind UMD bundle**

The Pagefind browser bundle is loaded at runtime from `/pagefind/pagefind.js` and exports a singleton with `search()`. Since we load it dynamically (not via a bundler import), we declare a minimal type for our wrapper. Add to `src/env.d.ts`:

```ts
declare module "*?pagefind" {
  // dummy export so TS treats this as a module
  const _: never;
  export default _;
}

export interface PagefindResult {
  readonly id: string;
  readonly data: () => Promise<{
    readonly url: string;
    readonly excerpt: string;
    readonly meta: Record<string, string>;
  }>;
}

export interface PagefindApi {
  readonly search: (
    query: string,
  ) => Promise<{ readonly results: readonly PagefindResult[] }>;
}

declare global {
  interface Window {
    readonly __pagefind?: PagefindApi;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/env.d.ts
git commit -m "feat(search): pagefind types for browser global"
```

---

### Task 16: `pagefind-client.ts` loader

**Files:**
- Create: `src/lib/search/pagefind-client.ts`

- [ ] **Step 1: Implement lazy loader**

```ts
// src/lib/search/pagefind-client.ts

let pagefindPromise: Promise<PagefindApi> | null = null;

export function loadPagefind(): Promise<PagefindApi> {
  if (pagefindPromise) return pagefindPromise;
  pagefindPromise = import(/* @vite-ignore */ "/pagefind/pagefind.js")
    .then((mod: PagefindApi) => {
      window.__pagefind = mod;
      return mod;
    })
    .catch((err) => {
      pagefindPromise = null; // allow retry
      throw err;
    });
  return pagefindPromise;
}
```

Drop the `@vite-ignore` comment if Vite still tries to resolve it (it will, because absolute paths starting with `/` are server-relative — Vite's import-analysis stays out of it; the comment is defensive).

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS. If `PagefindApi` is unresolved, ensure the `src/env.d.ts` additions are picked up — the `tsconfig.json` already includes `src/**/*.d.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/search/pagefind-client.ts
git commit -m "feat(search): pagefind browser client loader"
```

---

### Task 17: `CommandPalette.tsx` React island

**Files:**
- Create: `src/components/search/CommandPalette.tsx`
- Create: `src/components/search/CommandPalette.css`

- [ ] **Step 1: Implement palette**

```tsx
// src/components/search/CommandPalette.tsx
import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { loadPagefind } from "~/lib/search/pagefind-client";
import "./CommandPalette.css";

interface Hit {
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly excerpt: string;
}

export default function CommandPalette(): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<readonly Hit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("astro-open-search", openHandler);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("astro-open-search", openHandler);
    };
    function openHandler(): void {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (query.trim().length === 0) {
      setHits([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const pagefind = await loadPagefind();
        const { results } = await pagefind.search(query);
        const limited = results.slice(0, 8);
        const enriched: Hit[] = await Promise.all(
          limited.map(async (r) => {
            const data = await r.data();
            return {
              id: r.id,
              title: data.meta.title ?? data.url,
              url: data.url,
              excerpt: data.excerpt,
            };
          }),
        );
        if (!cancelled) setHits(enriched);
      } catch (err) {
        if (!cancelled) setHits([]);
        console.error("pagefind search failed", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Поиск по сайту"
      className="command-palette"
    >
      <Command.Input
        value={query}
        onValueChange={setQuery}
        placeholder="Найти статью…"
        autoFocus
      />
      <Command.List>
        {loading && <Command.Loading>Идёт поиск…</Command.Loading>}
        {!loading && query && hits.length === 0 && (
          <Command.Empty>Ничего не найдено.</Command.Empty>
        )}
        {hits.map((h) => (
          <Command.Item
            key={h.id}
            value={`${h.title} ${h.excerpt}`}
            onSelect={() => {
              window.location.href = h.url;
            }}
          >
            <span
              className="command-palette__title"
              dangerouslySetInnerHTML={{ __html: h.title }}
            />
            <span
              className="command-palette__excerpt"
              dangerouslySetInnerHTML={{ __html: h.excerpt }}
            />
          </Command.Item>
        ))}
      </Command.List>
      <div className="command-palette__hint">
        <kbd>↑</kbd>
        <kbd>↓</kbd> навигация · <kbd>Enter</kbd> открыть · <kbd>Esc</kbd> закрыть
      </div>
    </Command.Dialog>
  );
}
```

(Note: Pagefind highlights matches with HTML in `excerpt` and `meta.title` — that's why `dangerouslySetInnerHTML` is used. The strings come from our own indexed content, not user input.)

- [ ] **Step 2: Add styles**

Create `src/components/search/CommandPalette.css`:

```css
[cmdk-dialog] {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: color-mix(in srgb, var(--color-bg) 70%, transparent);
  display: grid;
  place-items: start center;
  padding-top: 12vh;
}

[cmdk-root].command-palette {
  width: min(640px, 92vw);
  background: var(--color-bg-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg, 12px);
  box-shadow: var(--shadow-lg, 0 20px 60px rgb(0 0 0 / 0.25));
  overflow: hidden;
}

[cmdk-input] {
  width: 100%;
  padding: 16px 20px;
  font: 16px/1.4 var(--font-sans);
  background: transparent;
  color: var(--color-fg);
  border: none;
  border-bottom: 1px solid var(--color-border);
  outline: none;
}

[cmdk-list] {
  max-height: 60vh;
  overflow-y: auto;
  padding: 8px;
}

[cmdk-item] {
  display: grid;
  gap: 4px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-family: var(--font-sans);
}

[cmdk-item][data-selected="true"] {
  background: var(--color-bg-subtle);
}

.command-palette__title {
  font-weight: 600;
  color: var(--color-fg);
}

.command-palette__excerpt {
  font-size: 13px;
  color: var(--color-fg-subtle);
  line-height: 1.4;
}

.command-palette__excerpt mark,
.command-palette__title mark {
  background: color-mix(in srgb, var(--color-accent) 25%, transparent);
  color: inherit;
  padding: 0 2px;
  border-radius: 2px;
}

.command-palette__hint {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-fg-subtle);
  border-top: 1px solid var(--color-border);
  font-family: var(--font-mono);
}

.command-palette__hint kbd {
  background: var(--color-bg-subtle);
  padding: 1px 6px;
  border-radius: 3px;
  font: inherit;
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/components/search/CommandPalette.tsx src/components/search/CommandPalette.css
git commit -m "feat(search): cmdk command palette with pagefind"
```

---

### Task 18: Mount palette in BaseLayout + header search button

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/components/Header.astro`

- [ ] **Step 1: Mount the palette in BaseLayout**

Find `BaseLayout.astro`. Near the closing `</body>` (or wherever islands are mounted), add:

```astro
---
import CommandPalette from "~/components/search/CommandPalette";
---
<!-- existing layout markup -->
<CommandPalette client:idle />
```

Adjust the import path if `BaseLayout.astro` lives elsewhere (the file should be in `src/layouts/`).

- [ ] **Step 2: Add a search button in `Header.astro` that dispatches the open event**

In `src/components/Header.astro`, inside the nav, add a button:

```astro
<button
  type="button"
  class="header__search"
  aria-label="Поиск (⌘K)"
  onclick="window.dispatchEvent(new CustomEvent('astro-open-search'))"
>
  <span aria-hidden="true">⌘K</span>
  <span class="visually-hidden">Поиск</span>
</button>
```

Add minimal styles (in the same component's `<style>` block or `global.css`):

```css
.header__search {
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 4px 10px;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  background: var(--color-bg-subtle);
  color: var(--color-fg-subtle);
  cursor: pointer;
}
.header__search:hover {
  background: var(--color-bg-elevated);
  color: var(--color-fg);
}
```

- [ ] **Step 3: Manually verify**

```bash
pnpm build && pnpm preview
```

Visit `http://localhost:4321/`, press `⌘K` (or click the header button) → palette opens. Type → results appear. Click → navigates.

- [ ] **Step 4: Commit**

```bash
git add src/layouts/BaseLayout.astro src/components/Header.astro
git commit -m "feat(search): mount command palette + header trigger"
```

---

### Task 19: Phase D checkpoint

- [ ] **Step 1: typecheck + lint + tests**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: PASS.

- [ ] **Step 2: No commit unless fixes needed.**

---

## Phase E — SSR `/search` fallback

### Task 20: Pagefind Node API helper

**Files:**
- Create: `src/lib/search/pagefind-node.ts`

- [ ] **Step 1: Implement Node-side search**

```ts
// src/lib/search/pagefind-node.ts
import { resolve } from "node:path";
import { existsSync } from "node:fs";

export interface NodeSearchHit {
  readonly url: string;
  readonly title: string;
  readonly excerpt: string;
}

let cached: { readonly search: (q: string) => Promise<{ results: NodeSearchHit[] }> } | null = null;

async function load(): Promise<typeof cached> {
  if (cached) return cached;
  const distPagefind = resolve(process.cwd(), "dist", "pagefind", "pagefind.js");
  if (!existsSync(distPagefind)) return null;
  // Pagefind ships an ESM bundle that runs in Node 18+ via dynamic import.
  const mod = (await import(/* @vite-ignore */ distPagefind)) as {
    search: (q: string) => Promise<{
      results: readonly { data: () => Promise<{ url: string; meta: { title?: string }; excerpt: string }> }[];
    }>;
  };
  cached = {
    search: async (q: string) => {
      const { results } = await mod.search(q);
      const top = results.slice(0, 20);
      const enriched = await Promise.all(
        top.map(async (r) => {
          const data = await r.data();
          return {
            url: data.url,
            title: data.meta.title ?? data.url,
            excerpt: data.excerpt,
          };
        }),
      );
      return { results: enriched };
    },
  };
  return cached;
}

export async function searchNode(query: string): Promise<readonly NodeSearchHit[]> {
  const api = await load();
  if (!api || query.trim().length === 0) return [];
  const { results } = await api.search(query);
  return results;
}
```

(Pagefind's official Node bindings use `pagefind/api`; if `dist/pagefind/pagefind.js` ESM does not run cleanly in Node, switch to `import("pagefind")` or read `dist/pagefind/pagefind.json` and replicate the lookup. Implementer should verify which works against the installed Pagefind version and pick the simpler path.)

- [ ] **Step 2: Typecheck**

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/search/pagefind-node.ts
git commit -m "feat(search): pagefind Node-side search helper"
```

---

### Task 21: `/search.astro` SSR page

**Files:**
- Create: `src/pages/search.astro`

- [ ] **Step 1: Implement page**

```astro
---
// src/pages/search.astro
export const prerender = false;

import BaseLayout from "~/layouts/BaseLayout.astro";
import { searchNode } from "~/lib/search/pagefind-node";

const url = new URL(Astro.request.url);
const query = url.searchParams.get("q")?.trim() ?? "";
const hits = query ? await searchNode(query) : [];
---

<BaseLayout title={query ? `Поиск: ${query}` : "Поиск"} description="Поиск по блогу">
  <main class="search-page">
    <h1>Поиск</h1>
    <form method="get" action="/search" role="search">
      <input
        type="search"
        name="q"
        value={query}
        placeholder="Запрос…"
        aria-label="Поисковый запрос"
        autofocus
      />
      <button type="submit">Найти</button>
    </form>

    {query && hits.length === 0 && (
      <p class="search-page__empty">По запросу «{query}» ничего не найдено.</p>
    )}

    {hits.length > 0 && (
      <ul class="search-page__results">
        {hits.map((h) => (
          <li>
            <a href={h.url}>
              <h2 set:html={h.title} />
              <p set:html={h.excerpt} />
            </a>
          </li>
        ))}
      </ul>
    )}

    {!query && (
      <p class="search-page__hint">
        Введите запрос или нажмите <kbd>⌘K</kbd> где угодно на сайте.
      </p>
    )}
  </main>
</BaseLayout>

<style>
  .search-page {
    max-width: 720px;
    margin: 0 auto;
    padding: 32px 16px;
  }
  .search-page form {
    display: flex;
    gap: 8px;
    margin: 16px 0 24px;
  }
  .search-page input[type="search"] {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg-elevated);
    color: var(--color-fg);
    font: 14px/1.4 var(--font-sans);
  }
  .search-page button {
    padding: 8px 16px;
    border: 1px solid var(--color-border);
    border-radius: 6px;
    background: var(--color-bg-subtle);
    color: var(--color-fg);
    cursor: pointer;
    font-family: var(--font-sans);
  }
  .search-page__results {
    list-style: none;
    padding: 0;
    display: grid;
    gap: 16px;
  }
  .search-page__results li a {
    display: block;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    color: inherit;
    text-decoration: none;
  }
  .search-page__results li a:hover {
    background: var(--color-bg-elevated);
  }
  .search-page__results h2 {
    margin: 0 0 4px;
    font-size: 18px;
  }
  .search-page__results p {
    margin: 0;
    color: var(--color-fg-subtle);
    font-size: 14px;
  }
  .search-page__empty,
  .search-page__hint {
    color: var(--color-fg-subtle);
    font-style: italic;
  }
</style>
```

- [ ] **Step 2: Smoke test**

```bash
pnpm build && pnpm preview
```

Visit `http://localhost:4321/search?q=astro` — should render hits. Visit `/search` (no query) — should show the hint.

- [ ] **Step 3: Commit**

```bash
git add src/pages/search.astro
git commit -m "feat(search): SSR /search fallback page"
```

---

### Task 22: Phase E checkpoint

- [ ] **Step 1: typecheck + lint + tests**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: PASS.

---

## Phase F — E2E + a11y + cleanup

### Task 23: E2E — public command palette

**Files:**
- Create: `tests/e2e/search-palette.spec.ts`

- [ ] **Step 1: Write test**

```ts
import { expect, test } from "@playwright/test";

test("⌘K opens palette and navigates to a result", async ({ page, browserName }) => {
  await page.goto("/");
  // Use Control on Linux/Chromium, Meta on Mac
  const mod = browserName === "webkit" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+k`);
  // Palette is mounted; look for the cmdk dialog
  await expect(page.locator("[cmdk-dialog]")).toBeVisible({ timeout: 5_000 });
  await page.locator("[cmdk-input]").fill("context");
  // Wait for at least one result (Pagefind is fast but async)
  const firstItem = page.locator("[cmdk-item]").first();
  await expect(firstItem).toBeVisible({ timeout: 5_000 });
  await firstItem.click();
  // Should navigate away from /
  await expect(page).not.toHaveURL(/\/$/);
});
```

- [ ] **Step 2: Make sure the e2e setup builds the site once before tests**

Inspect `playwright.config.ts`. The `webServer` block currently runs `pnpm dev`. **Pagefind requires `dist/`**, so the e2e suite must build first. Update the webServer command:

```ts
webServer: {
  command: "pnpm build && pnpm preview --host 127.0.0.1 --port 4321",
  url: "http://127.0.0.1:4321",
  timeout: 240_000,
  reuseExistingServer: !process.env.CI,
},
```

If the existing config uses `pnpm dev`, **only this single test file** can be flagged to require the built version. Pragmatic solution: keep `pnpm dev` for admin tests (faster) and add a project entry for search tests using the preview server. The minimum viable change: switch the global webServer to `pnpm build && pnpm preview`. Yes, e2e becomes slower (~30s build), but admin tests still pass against preview.

If the implementer determines the build-then-preview approach is too disruptive, fall back to: **skip the search e2e in CI when `dist/pagefind/` is missing** with `test.skip(!existsSync('dist/pagefind/pagefind.js'), '...')`. Document the choice in the commit message.

- [ ] **Step 3: Run test**

```bash
pnpm test:e2e tests/e2e/search-palette.spec.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/search-palette.spec.ts playwright.config.ts
git commit -m "test(search): e2e for command palette"
```

---

### Task 24: E2E — admin search filter

**Files:**
- Create: `tests/e2e/admin-search.spec.ts`

- [ ] **Step 1: Write test**

```ts
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("e2e-admin@test.dev");
  await page.locator('input[name="password"]').fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

test("admin can filter posts via search input", async ({ page }) => {
  await login(page);
  await page.goto("/admin/posts");

  // Count rows initially
  const initial = await page.locator(".post-list__title").count();
  expect(initial).toBeGreaterThan(2);

  // Search for a known fragment
  await page.locator('input[type="search"]').fill("context");
  // Debounced 300ms — wait
  await page.waitForTimeout(500);

  const filtered = await page.locator(".post-list__title").count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(initial);
});
```

- [ ] **Step 2: Run test**

```bash
pnpm test:e2e tests/e2e/admin-search.spec.ts
```

Expected: PASS. If `.post-list__title` is not the actual class, inspect the rendered DOM and adjust.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/admin-search.spec.ts
git commit -m "test(search): e2e for admin search filter"
```

---

### Task 25: E2E — `/search` SSR

**Files:**
- Create: `tests/e2e/search-page.spec.ts`

- [ ] **Step 1: Write test**

```ts
import { expect, test } from "@playwright/test";

test("/search?q= renders results SSR", async ({ page }) => {
  await page.goto("/search?q=context");
  await expect(page.locator("h1", { hasText: /поиск/i })).toBeVisible();
  await expect(page.locator(".search-page__results li")).toHaveCount(
    await page.locator(".search-page__results li").count(),
  );
  // At least the hint or one result is on the page (no-results path is also valid)
  const results = await page.locator(".search-page__results li").count();
  const empty = await page.locator(".search-page__empty").isVisible();
  expect(results > 0 || empty).toBe(true);
});

test("/search empty state shows hint", async ({ page }) => {
  await page.goto("/search");
  await expect(page.locator(".search-page__hint")).toBeVisible();
});
```

- [ ] **Step 2: Run test**

```bash
pnpm test:e2e tests/e2e/search-page.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/search-page.spec.ts
git commit -m "test(search): e2e for /search SSR"
```

---

### Task 26: A11y — extend axe baseline

**Files:**
- Modify: `tests/e2e/a11y.spec.ts`

- [ ] **Step 1: Add `/search` to PAGES array**

In `tests/e2e/a11y.spec.ts`, append to the `PAGES` array:

```ts
{ path: "/search", auth: "public" },
{ path: "/search?q=context", auth: "public" },
```

- [ ] **Step 2: Add a separate test for the open command palette**

Append after the existing describe block:

```ts
test("no serious/critical a11y violations in open command palette", async ({ page, browserName }) => {
  await page.goto("/");
  const mod = browserName === "webkit" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+k`);
  await expect(page.locator("[cmdk-dialog]")).toBeVisible();

  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  if (blocking.length > 0) console.log(JSON.stringify(blocking, null, 2));
  expect(blocking).toEqual([]);
});
```

- [ ] **Step 3: Run**

```bash
pnpm test:e2e tests/e2e/a11y.spec.ts
```

Expected: PASS. Fix any new violations before committing — if `cmdk` produces `aria-required-children` issues, add `role="listbox"` / `role="option"` overrides via `[cmdk-list]` and `[cmdk-item]` attributes (see cmdk docs).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/a11y.spec.ts
git commit -m "test(search): extend axe baseline to /search and open palette"
```

---

### Task 27: Cleanup — stray hello-world.md

**Files:**
- Delete: `src/content/posts/hello-world.md`

- [ ] **Step 1: Verify the canonical file is `.mdx`**

```bash
ls src/content/posts/hello-world.* 2>&1
```

Expected: both `hello-world.md` and `hello-world.mdx` exist; the `.mdx` is canonical (per memory bug-watch-list #9).

- [ ] **Step 2: Confirm the `.md` is not referenced anywhere**

```bash
grep -rn "hello-world" src/ --include='*.astro' --include='*.tsx' --include='*.ts' | grep -v hello-world.mdx
```

Expected: no hits beyond the file itself.

- [ ] **Step 3: Delete and commit**

```bash
rm src/content/posts/hello-world.md
git add src/content/posts/hello-world.md
git commit -m "chore: remove duplicate hello-world.md (canonical is .mdx)"
```

---

### Task 28: Final gauntlet + push

- [ ] **Step 1: Full local verification**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm test:e2e
```

Expected: ALL PASS. If e2e is slow (build takes ~30s), accept and proceed.

- [ ] **Step 2: Push branch**

```bash
git push origin feat/cms-core
```

- [ ] **Step 3: Report status**

Print a summary: tasks completed, tests added (count), known issues remaining (refer to memory `bug-watch-list`).

---

## Out-of-scope reminders

- **Designer subagent (Plan 4):** scaffolding `.claude/agents/designer.md` + `design-system-tokens` and `ui-design-review` skills is deferred. Do not include in this plan.
- **Slug renames + redirects** (memory `bug-watch-list` #8) — deferred to v2.
- **Multi-language stemmers** — `simple` dictionary is intentional; no stemming.
- **Multi-instance Pagefind rebuild coordination** — single-node only; pg-boss/Redis is out of scope.
- **Default Pagefind UI** (`@pagefind/default-ui`) — intentionally not used; we ship our own UI built on `cmdk` to match Editorial × Technical tokens.
