# LLM-Citable Retrieval Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec:** `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md` (EPIC C only — Phases 1, 2, 4, 5 of the parent spec are out of scope for this plan)

**Goal:** Make every published post a citation-ready, chunkable artifact for LLM retrieval. Extend the post zod schema with `summary`, `keywords`, `faq[]`, `lang`. Ship five MDX components (`<Tldr>`, `<KeyTakeaways>`, `<Faq>`, `<Compare>`, `<Definition>`) under `src/components/mdx/`, auto-injected globally via the MDX integration so authors don't import per-file. `PostLayout` renders `<Tldr>` automatically when `frontmatter.summary` is present, renders `<Faq>` automatically when `frontmatter.faq[]` is non-empty (and merges a `FAQPage` node into the existing `@graph`), and shows a `RelatedPosts` block (top-3 by Jaccard tag overlap, same locale) above the AuthorCard.

**Architecture:** Five small `.astro` components under `src/components/mdx/`, each ≤ 100 LoC, each with a Vitest unit test that uses Astro 5's `experimental_AstroContainer` to render to HTML. A new pure module `src/lib/related.ts` computes Jaccard similarity over `tags` filtered by locale; consumed at build time by `PostLayout.astro`. The existing `src/lib/seo/schema.ts::buildFaqPageNode` (shipped in Plan 1 Task 4) is wired into `PostLayout`'s `extraSchemaNodes` array — Plan 1 already established that `BaseLayout` concatenates these into the single `<script type="application/ld+json">` block. Component auto-injection uses Astro MDX's `optimize.customComponentNames` is **not** appropriate; we use Astro's documented `mdx({ ... })` integration combined with a `default` re-export pattern: components are listed in a single `src/components/mdx/index.ts` and a thin `MdxComponents.astro` wrapper passes them down to the rendered MDX content via Astro's `<Content components={...} />` slot — that wrapper lives inside `PostLayout` so authors get the components globally without importing.

**Tech Stack:** Astro 5, TypeScript 5.9 strict, Vitest 3, `experimental_AstroContainer` for component HTML rendering. Zero new runtime dependencies.

---

## Working notes for agents

**Subagent assignments (per CLAUDE.md):**
- `architect` → consulted ONCE before Task 0 to confirm the auto-injection approach (`<Content components={...} />` vs `astro.config.ts` MDX `components` option). The plan locks the choice; architect re-review only if assumptions change.
- `frontender` → all `src/components/mdx/*.astro` components, `PostLayout.astro` edits.
- `backender` → `src/lib/related.ts`, `src/content.config.ts` zod extension, `scripts/translate.ts` field-pass-through edit.
- `critic` → end-of-phase review at the end of Phase 2 and at the end of Phase 5.

**Discipline (from CLAUDE.md):**
- Run `mcp__gitnexus__impact({target, direction: "upstream", repo: "astro-blog"})` BEFORE editing `PostLayout.astro` (Tasks 2, 3, 7), `src/content.config.ts` (Task 1), and `scripts/translate.ts` (Task 8). The schema and PostLayout are HIGH blast radius.
- Run `mcp__gitnexus__detect_changes({scope: "staged", repo: "astro-blog"})` BEFORE every commit.
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`. Never `--no-verify`.
- Functional style: no `class`, no `this`, named/arrow functions, immutable data.
- After commits, the post-commit hook auto-runs `npx gitnexus analyze` — don't re-run it manually.

**Plan 1 + Plan 2 dependencies (assumed shipped before starting this plan):**
- `src/lib/seo/schema.ts` exports `buildFaqPageNode(input)` (Plan 1 Task 4) — returns `null` when `items.length === 0`, else a `FAQPage` node.
- `BaseLayout.astro` accepts `extraSchemaNodes: ReadonlyArray<GraphNode | null>` and concatenates into `buildGraph` (Plan 1 Task 7).
- `PostLayout.astro` already builds `BlogPosting` and `BreadcrumbList` nodes and passes them as `extraSchemaNodes={[blogPostingNode, breadcrumbNode]}` (Plan 1 Task 8).
- `AuthorCard.astro` exists and renders below the post body (Plan 2). Related posts go ABOVE `<AuthorCard>` and BELOW `<slot />` (the post body).
- `getOrderedPosts({ locale })` from `src/lib/content/loader.ts` returns posts pre-filtered by locale and sorted by pinned/order.

**Commands cheat sheet:**
- `pnpm typecheck` — `astro sync && astro check && tsc --noEmit`
- `pnpm test` — Vitest unit + integration
- `pnpm test tests/unit/mdx` — only this plan's component tests
- `pnpm test tests/unit/related` — only the related-posts test
- `pnpm lint` — eslint + prettier check
- `pnpm build` — full build (regenerates Pagefind)
- `pnpm dev` — http://localhost:4321

**Worktree (recommended):** before starting, run:
```bash
git worktree add ../astro-blog-llm-retrieval -b feat/llm-retrieval-components main
cd ../astro-blog-llm-retrieval
pnpm install
```

**Risk callouts (READ BEFORE STARTING):**

1. **Schema migration is back-compat-safe.** All four new fields (`summary`, `keywords`, `faq`, `lang`) are `.optional()`. Existing 14 RU + 14 EN posts validate unchanged. Task 1 ships a Vitest test that fails for posts with `pubDate >= 2026-05-02` lacking `summary`, but lets older posts through.
2. **`PostLayout` impact is MEDIUM.** Used by `src/pages/blog/[...slug].astro` and `src/pages/en/blog/[...slug].astro` only. No SSR routes consume it. Run impact on it before Task 2.
3. **Cross-locale tag leakage.** `RelatedPosts` MUST filter by `lang` first (string locale prefix on `entry.id`) BEFORE computing Jaccard. Forgetting this surfaces EN posts on RU pages and tanks crawler trust. Test for it explicitly.
4. **Auto-injection name collision.** `<Faq>`, `<Tldr>`, `<Compare>`, `<Definition>`, `<KeyTakeaways>` could collide with hand-imported user components. Convention enforced: kebab-case CSS classes (`.tldr`, `.faq`, etc.), capitalised component names. Plan ships docs in CLAUDE.md (Task 9).
5. **`FAQPage` JSON-LD must enter the existing `@graph`.** Plan 1 Task 8 already passes `extraSchemaNodes={[blogPostingNode, breadcrumbNode]}` to `BaseLayout`. Task 3 in this plan **appends** the FAQPage node when `faq` frontmatter is present. The merged array must NOT contain duplicates and MUST not break when `faq` is absent (`buildFaqPageNode` returns `null`, which `buildGraph` filters out — verified by Plan 1 Task 6 test).
6. **Translation pipeline.** `scripts/translate.ts` (Plan 1 baseline) translates `title`, `description`, `coverAlt` and pulls them through frontmatter. We extend it (Task 8) to translate `summary` (prose) and `faq[].question` / `faq[].answer` (prose), and pass `keywords` and `lang` verbatim. `keywords` are technical/short and aren't worth re-translating; `lang` is per-file and decided at write time.

---

# Phase 0 — Setup

### Task 0: Verify clean state and impact-check load-bearing files

**Subagent:** `backender`

**Files:** none (read-only)

- [x] **Step 1:** Confirm a clean working tree.

```bash
git status
```
Expected: `nothing to commit, working tree clean`. If `.gitignore` is dirty from a prior session that's OK; otherwise stash first.

- [x] **Step 2:** Confirm Plan 1 + Plan 2 prerequisites are merged.

```bash
test -f src/lib/seo/schema.ts && echo "seo: OK" || echo "seo: MISSING"
test -f src/components/AuthorCard.astro && echo "authorcard: OK" || echo "authorcard: MISSING"
grep -q "extraSchemaNodes" src/layouts/BaseLayout.astro && echo "baselayout: OK" || echo "baselayout: MISSING"
grep -q "extractArticleBody" src/layouts/PostLayout.astro && echo "postlayout: OK" || echo "postlayout: MISSING"
```
Expected: four `OK` lines. If anything reports `MISSING`, STOP and merge Plans 1 and 2 first.

- [x] **Step 3:** Run gitnexus impact analysis on the load-bearing symbols this plan touches.

```
mcp__gitnexus__impact({ target: "PostLayout", direction: "upstream", repo: "astro-blog" })
mcp__gitnexus__impact({ target: "buildFaqPageNode", direction: "upstream", repo: "astro-blog" })
mcp__gitnexus__impact({ target: "collections", direction: "upstream", repo: "astro-blog" })
```

Expected:
- `PostLayout` — MEDIUM (consumed by `src/pages/blog/[...slug].astro` and `src/pages/en/blog/[...slug].astro` only).
- `buildFaqPageNode` — LOW (currently only used by tests; this plan adds the first call site).
- `collections` (in `src/content.config.ts`) — HIGH (every page that reads `getCollection("posts")` depends on the schema). Note the call sites in the PR description.

- [x] **Step 4:** Run baseline checks to confirm a green start.

```bash
pnpm typecheck && pnpm test && pnpm lint
```
Expected: all pass.

---

# Phase 1 — Schema extension (C1)

### Task 1: Extend the post collection zod schema with `summary`, `keywords`, `faq`, `lang`

**Subagent:** `backender`

**Files:**
- Modify: `src/content.config.ts`
- Create: `tests/unit/content/schema.test.ts`

- [x] **Step 1:** Run impact analysis.

```
mcp__gitnexus__impact({ target: "collections", direction: "upstream", repo: "astro-blog" })
```
Expected: HIGH risk; capture every consumer of `getCollection("posts")` in your notes. Existing posts must continue to validate after this change — back-compat is enforced by `.optional()` on every new field.

- [x] **Step 2:** Write the failing test.

Create `tests/unit/content/schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

const POSTS_DIR = join(process.cwd(), "src/content/posts");
const FENCE = /^---\r?\n([\s\S]*?)\r?\n---/;
const CUTOFF_ISO = "2026-05-02";

interface RawPost {
  readonly file: string;
  readonly fm: Record<string, unknown>;
}

const collectPosts = (dir: string): readonly RawPost[] => {
  const out: RawPost[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      out.push(...collectPosts(join(dir, entry.name)));
      continue;
    }
    if (!/\.(md|mdx)$/.test(entry.name)) continue;
    const raw = readFileSync(join(dir, entry.name), "utf8");
    const m = FENCE.exec(raw);
    if (!m || !m[1]) continue;
    const fm = (yaml.load(m[1]) ?? {}) as Record<string, unknown>;
    out.push({ file: join(dir, entry.name), fm });
  }
  return out;
};

const posts = collectPosts(POSTS_DIR);

const isoOf = (v: unknown): string => {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "string") return v.slice(0, 10);
  return "";
};

describe("post schema — back-compat for existing posts", () => {
  it("all existing posts (pubDate < cutoff) parse without summary", () => {
    const old = posts.filter((p) => isoOf(p.fm["pubDate"]) < CUTOFF_ISO);
    // 14 RU + 14 EN baseline. Assertion guards against accidental cutoff
    // drift; bump the floor when intentional history grows.
    expect(old.length).toBeGreaterThanOrEqual(28);
    for (const p of old) {
      // No assertion on `summary` presence — back-compat by design.
      expect(typeof p.fm["title"]).toBe("string");
    }
  });
});

describe("post schema — required fields after cutoff", () => {
  it("every post with pubDate >= 2026-05-02 has a summary", () => {
    const fresh = posts.filter((p) => isoOf(p.fm["pubDate"]) >= CUTOFF_ISO);
    const missing = fresh.filter((p) => typeof p.fm["summary"] !== "string");
    if (missing.length > 0) {
      const list = missing.map((p) => `  - ${p.file}`).join("\n");
      throw new Error(
        `Posts published on/after ${CUTOFF_ISO} must define \`summary\` ` +
          `(60–280 chars TL;DR). Missing in:\n${list}`,
      );
    }
  });

  it("if `summary` is present it is 60–280 chars", () => {
    for (const p of posts) {
      const s = p.fm["summary"];
      if (typeof s !== "string") continue;
      expect(s.length).toBeGreaterThanOrEqual(60);
      expect(s.length).toBeLessThanOrEqual(280);
    }
  });

  it("if `faq` is present each item has question + answer", () => {
    for (const p of posts) {
      const faq = p.fm["faq"];
      if (!Array.isArray(faq)) continue;
      for (const item of faq) {
        expect(typeof (item as Record<string, unknown>)["question"]).toBe("string");
        expect(typeof (item as Record<string, unknown>)["answer"]).toBe("string");
      }
    }
  });

  it("if `lang` is present it is 'ru' or 'en'", () => {
    for (const p of posts) {
      const lang = p.fm["lang"];
      if (lang === undefined) continue;
      expect(["ru", "en"]).toContain(lang);
    }
  });
});
```

- [x] **Step 3:** Run the test to verify it passes already (back-compat assertions are green; no fresh post exists yet).

```bash
pnpm test tests/unit/content/schema.test.ts
```
Expected: PASS — old posts have no summary (allowed); no fresh posts with `pubDate >= 2026-05-02` exist; `faq`/`lang` checks vacuously hold.

(The "fresh post needs summary" guard is dormant until the next post is published. That's correct: this test enforces forward, not historical, invariants.)

- [x] **Step 4:** Modify `src/content.config.ts` to add the new fields.

Replace the entire file with:

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/posts" }),
  schema: z.object({
    title: z.string().min(3).max(120),
    description: z.string().min(10).max(200),
    // TL;DR — answer-first 60–280-char card rendered above the post body.
    // Required for posts authored after 2026-05-02 (enforced by tests/unit/content/schema.test.ts).
    summary: z.string().min(60).max(280).optional(),
    // Semantic keywords for retrieval. Distinct from `tags` (which are slugs
    // used for tag archives). Free-form short noun phrases — examples:
    // "harness", "prompt caching", "tool use loop".
    keywords: z.array(z.string()).default([]),
    // Question/Answer pairs. When non-empty, PostLayout renders a <Faq>
    // block below the body and emits a FAQPage JSON-LD node into the
    // single page @graph (via extraSchemaNodes).
    faq: z
      .array(
        z.object({
          question: z.string().min(5).max(200),
          answer: z.string().min(20).max(2000),
        }),
      )
      .optional(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    // Cover stores a relative path under /uploads/ (public URL, not a local asset).
    cover: z.string().optional(),
    coverAlt: z.string().optional(),
    sourceHash: z.string().optional(),
    manuallyEdited: z.boolean().default(false),
    author: z.string().default("Артём"),
    // Explicit locale. Optional; PostLayout derives from path when absent.
    // Useful for round-tripping in the translation pipeline.
    lang: z.enum(["ru", "en"]).optional(),
  }),
});

const site = defineCollection({
  loader: glob({ pattern: "**/*.md", base: "./src/content/site" }),
  schema: z.object({
    title: z.string(),
    description: z.string().min(10).max(200).optional(),
    sourceHash: z.string().optional(),
    manuallyEdited: z.boolean().default(false),
  }),
});

export const collections = { posts, site };
```

- [x] **Step 5:** Sync types and re-typecheck.

```bash
pnpm typecheck
```
Expected: 0 errors. Astro regenerates `.astro/content.d.ts` so `CollectionEntry<"posts">` now exposes `summary?: string`, `keywords: readonly string[]`, `faq?: Array<{question: string; answer: string}>`, `lang?: "ru" | "en"`.

- [x] **Step 6:** Run the schema test and the full suite.

```bash
pnpm test tests/unit/content/schema.test.ts && pnpm test
```
Expected: PASS — all green, including the existing 14 RU + 14 EN posts.

- [x] **Step 7:** Detect changes scope.

```
mcp__gitnexus__detect_changes({ scope: "staged", repo: "astro-blog" })
```
Expected: `src/content.config.ts` and the new test file only.

- [x] **Step 8:** Commit.

```bash
git add src/content.config.ts tests/unit/content/schema.test.ts
git commit -m "feat(content): extend post schema with summary, keywords, faq, lang"
```

---

# Phase 2 — Tldr component + auto-render (C2)

### Task 2: `<Tldr>` MDX component + auto-render in PostLayout above body

**Subagent:** `frontender`

**Files:**
- Create: `src/components/mdx/Tldr.astro`
- Create: `src/components/mdx/index.ts`
- Create: `tests/unit/mdx/tldr.test.ts`
- Modify: `src/layouts/PostLayout.astro`

- [ ] **Step 1:** Run impact analysis on PostLayout.

```
mcp__gitnexus__impact({ target: "PostLayout", direction: "upstream", repo: "astro-blog" })
```
Expected: MEDIUM — `src/pages/blog/[...slug].astro`, `src/pages/en/blog/[...slug].astro`. Confirm before proceeding.

- [ ] **Step 2:** Write the failing test.

Create `tests/unit/mdx/tldr.test.ts`:

```ts
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Tldr from "~/components/mdx/Tldr.astro";

describe("<Tldr>", () => {
  it("renders a labelled aside with the prose payload", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Tldr, {
      slots: { default: "В двух словах: harness отличается от агента." },
    });
    expect(html).toContain('class="tldr"');
    expect(html).toMatch(/<aside\b/);
    expect(html).toContain("В двух словах");
    // a11y: aside must be labelled
    expect(html).toMatch(/aria-label="(TL;DR|tldr|TLDR)"/i);
  });

  it("renders a `text` prop when no slot is provided", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Tldr, {
      props: { text: "Краткое содержание." },
    });
    expect(html).toContain("Краткое содержание");
  });

  it("renders nothing when neither prop nor slot is provided", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Tldr, {});
    // Guard: an empty Tldr must not emit a stray <aside>
    expect(html).not.toMatch(/<aside\b/);
  });
});
```

- [ ] **Step 3:** Run the test to verify it fails.

```bash
pnpm test tests/unit/mdx/tldr.test.ts
```
Expected: FAIL — `Tldr.astro` does not exist.

- [ ] **Step 4:** Implement `src/components/mdx/Tldr.astro`.

```astro
---
/**
 * <Tldr>: answer-first card rendered above the post body.
 *
 * Two ways to use:
 *   1. `<Tldr>В двух словах…</Tldr>` — slot contains MDX/markdown.
 *   2. `<Tldr text="…" />` — string prop (used by PostLayout's auto-render).
 *
 * Renders nothing when neither prop nor slot is supplied.
 */
interface Props {
  text?: string;
}

const { text } = Astro.props;
const hasSlot = Astro.slots.has("default");
const showCard = hasSlot || (typeof text === "string" && text.length > 0);
---

{
  showCard && (
    <aside class="tldr" aria-label="TL;DR">
      <p class="tldr__label">TL;DR</p>
      {text && !hasSlot ? <p class="tldr__body">{text}</p> : <slot />}
    </aside>
  )
}

<style>
  .tldr {
    margin: 0 0 var(--space-6) 0;
    padding: var(--space-4) var(--space-5);
    border-left: 3px solid var(--color-accent);
    background: var(--color-bg-elevated);
    border-radius: var(--radius-sm);
  }
  .tldr__label {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-fg-muted);
    margin: 0 0 var(--space-2) 0;
  }
  .tldr__body {
    margin: 0;
    font-family: var(--font-sans);
    font-size: var(--fs-base);
    line-height: var(--lh-normal);
    color: var(--color-fg);
  }
</style>
```

- [ ] **Step 5:** Create the central re-export `src/components/mdx/index.ts` (will grow to include all five components in later tasks).

```ts
// Central re-export of MDX components. PostLayout passes this map to
// <Content components={...} /> so MD/MDX authors can use the tags as
// globals — no per-file imports.
//
// Adding a component:
//   1. Create `src/components/mdx/<Name>.astro`.
//   2. Re-export it here.
//   3. PostLayout will pick it up automatically via the spread.

import Tldr from "./Tldr.astro";

export const mdxComponents = {
  Tldr,
} as const;

export type MdxComponents = typeof mdxComponents;
```

- [ ] **Step 6:** Wire `<Tldr>` auto-render and component injection into `PostLayout.astro`.

Open `src/layouts/PostLayout.astro` and modify the frontmatter:

  - Add to the import list (immediately after the existing `~/i18n` import, line 7-ish):

```astro
import Tldr from "~/components/mdx/Tldr.astro";
import { mdxComponents } from "~/components/mdx";
```

  - In the destructure of `post.data` (line 17 in the Plan-1-shipped state), add `summary`:

```astro
const { title, description, pubDate, updatedDate, tags, cover, coverAlt, summary } = post.data;
```

  - Locate the existing render call. After Plans 1 + 2 the body looks like:

```astro
    <div class="post__body prose">
      <slot />
    </div>
```

  Replace it with:

```astro
    {summary && <Tldr text={summary} />}
    <div class="post__body prose">
      <slot />
    </div>
```

  - **Component map injection.** The `<slot />` above receives the rendered MDX body from the page (`src/pages/blog/[...slug].astro` calls `<Content components={mdxComponents} />`). We update the page next.

- [ ] **Step 7:** Update both blog page templates to pass `mdxComponents` into `<Content />`.

Open `src/pages/blog/[...slug].astro`. Find the `<Content />` invocation inside `<PostLayout>`. The slug page currently renders:

```astro
<PostLayout post={post} headings={headings}>
  <Content />
</PostLayout>
```

Replace with:

```astro
---
// existing imports …
import { mdxComponents } from "~/components/mdx";
// …
---

<PostLayout post={post} headings={headings}>
  <Content components={mdxComponents} />
</PostLayout>
```

Apply the **same** edit to `src/pages/en/blog/[...slug].astro`.

- [ ] **Step 8:** Run typecheck.

```bash
pnpm typecheck
```
Expected: 0 errors.

- [ ] **Step 9:** Run the unit test for `<Tldr>` and the full suite.

```bash
pnpm test tests/unit/mdx/tldr.test.ts && pnpm test
```
Expected: PASS — all green.

- [ ] **Step 10:** Manual smoke check.

```bash
pnpm dev
```

Add a temporary `summary` field to one existing post (e.g. `src/content/posts/01-introduction.md`) — set it to a 60–280 char string — then visit `http://localhost:4321/blog/01-introduction`. Confirm the `<aside class="tldr">` block renders above the post body.

```bash
curl -s http://localhost:4321/blog/01-introduction | grep -c 'class="tldr"'
```
Expected: `1`. Revert the temporary frontmatter edit (`git checkout -- src/content/posts/01-introduction.md`) before committing. Stop the dev server.

- [ ] **Step 11:** Detect changes scope.

```
mcp__gitnexus__detect_changes({ scope: "staged", repo: "astro-blog" })
```
Expected: 5 files — `src/components/mdx/Tldr.astro`, `src/components/mdx/index.ts`, `src/layouts/PostLayout.astro`, `src/pages/blog/[...slug].astro`, `src/pages/en/blog/[...slug].astro`, plus the test file.

- [ ] **Step 12:** Commit.

```bash
git add src/components/mdx/Tldr.astro src/components/mdx/index.ts src/layouts/PostLayout.astro src/pages/blog/[...slug].astro src/pages/en/blog/[...slug].astro tests/unit/mdx/tldr.test.ts
git commit -m "feat(mdx): add <Tldr> component with auto-render from frontmatter.summary"
```

---

# Phase 3 — Faq component + FAQPage JSON-LD (C3)

### Task 3: `<Faq>` MDX component + emit FAQPage JSON-LD

**Subagent:** `frontender`

**Files:**
- Create: `src/components/mdx/Faq.astro`
- Modify: `src/components/mdx/index.ts`
- Create: `tests/unit/mdx/faq.test.ts`
- Modify: `src/layouts/PostLayout.astro`

- [x] **Step 1:** Re-confirm `buildFaqPageNode` shape (Plan 1 Task 4 baseline).

```bash
grep -A 5 "buildFaqPageNode" src/lib/seo/nodes-page.ts | head -20
```
Expected: function signature `buildFaqPageNode({ canonical, items })` returning `null` when items are empty.

- [x] **Step 2:** Write the failing test.

Create `tests/unit/mdx/faq.test.ts`:

```ts
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Faq from "~/components/mdx/Faq.astro";

const sampleItems = [
  { question: "Что такое harness?", answer: "Это runtime-контейнер, в котором живёт LLM-цикл." },
  { question: "Что такое skill?", answer: "Файл-инструкция, который Claude активирует по триггеру." },
];

describe("<Faq>", () => {
  it("renders one <details> per item with the question as <summary>", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Faq, { props: { items: sampleItems } });
    const detailsCount = (html.match(/<details\b/g) ?? []).length;
    expect(detailsCount).toBe(2);
    expect(html).toContain("Что такое harness?");
    expect(html).toContain("Что такое skill?");
    expect(html).toContain("Это runtime-контейнер");
  });

  it("uses a labelled section with H2 heading", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Faq, { props: { items: sampleItems } });
    expect(html).toMatch(/<section[^>]+class="faq"/);
    expect(html).toMatch(/<h2[^>]*>FAQ<\/h2>/);
  });

  it("renders nothing when items array is empty", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Faq, { props: { items: [] } });
    expect(html).not.toMatch(/<section[^>]+class="faq"/);
    expect(html).not.toMatch(/<details\b/);
  });

  it("accepts a custom title prop", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Faq, {
      props: { items: sampleItems, title: "Часто задаваемые" },
    });
    expect(html).toContain("Часто задаваемые");
  });
});
```

- [x] **Step 3:** Run the test to verify it fails.

```bash
pnpm test tests/unit/mdx/faq.test.ts
```
Expected: FAIL — `Faq.astro` does not exist.

- [x] **Step 4:** Implement `src/components/mdx/Faq.astro`.

```astro
---
/**
 * <Faq>: renders a list of question/answer pairs as a <details> block.
 * Companion FAQPage JSON-LD is emitted by PostLayout via extraSchemaNodes,
 * so visual + structured layers stay in sync from a single frontmatter source.
 *
 * Usage:
 *   - Auto-rendered by PostLayout when frontmatter.faq[] is non-empty.
 *   - Authors may also place <Faq items={[…]} /> manually in MDX bodies.
 */
interface FaqItem {
  readonly question: string;
  readonly answer: string;
}

interface Props {
  items: ReadonlyArray<FaqItem>;
  title?: string;
}

const { items, title = "FAQ" } = Astro.props;
---

{
  items.length > 0 && (
    <section class="faq" aria-labelledby="faq-heading">
      <h2 id="faq-heading">{title}</h2>
      <dl class="faq__list">
        {items.map((it) => (
          <div class="faq__item">
            <dt>
              <details>
                <summary>{it.question}</summary>
                <dd class="faq__answer">
                  <p>{it.answer}</p>
                </dd>
              </details>
            </dt>
          </div>
        ))}
      </dl>
    </section>
  )
}

<style>
  .faq {
    margin: var(--space-7) 0 var(--space-6) 0;
    padding-top: var(--space-5);
    border-top: 1px solid var(--color-border);
  }
  .faq h2 {
    font-family: var(--font-serif);
    font-size: var(--fs-2xl);
    margin: 0 0 var(--space-4) 0;
  }
  .faq__list {
    margin: 0;
    padding: 0;
  }
  .faq__item {
    border-bottom: 1px solid var(--color-border);
  }
  .faq__item:last-child {
    border-bottom: none;
  }
  .faq__item dt {
    margin: 0;
  }
  .faq__item summary {
    font-family: var(--font-sans);
    font-weight: 500;
    font-size: var(--fs-base);
    color: var(--color-fg);
    padding: var(--space-3) 0;
    cursor: pointer;
    list-style: none;
  }
  .faq__item summary::-webkit-details-marker {
    display: none;
  }
  .faq__item summary::before {
    content: "+";
    display: inline-block;
    width: 1em;
    margin-right: var(--space-2);
    color: var(--color-fg-muted);
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .faq__item details[open] summary::before {
    content: "−";
  }
  .faq__answer {
    margin: 0 0 var(--space-3) 1.5em;
    color: var(--color-fg-muted);
    line-height: var(--lh-normal);
  }
  .faq__answer p {
    margin: 0;
  }
</style>
```

(Note: the markup nests `<details>` inside `<dt>` so the `<dl>/<dt>/<dd>` semantics hold while `<details>` provides progressive disclosure. Pure visual choice; structured FAQPage JSON-LD comes from `buildFaqPageNode` and does not depend on this markup.)

- [x] **Step 5:** Re-export `<Faq>` from the components index.

Update `src/components/mdx/index.ts`:

```ts
import Tldr from "./Tldr.astro";
import Faq from "./Faq.astro";

export const mdxComponents = {
  Tldr,
  Faq,
} as const;

export type MdxComponents = typeof mdxComponents;
```

- [x] **Step 6:** Wire `<Faq>` auto-render and FAQPage schema into `PostLayout.astro`.

Open `src/layouts/PostLayout.astro`. Modify the frontmatter:

  - Add to the imports:

```astro
import Faq from "~/components/mdx/Faq.astro";
import { buildFaqPageNode } from "~/lib/seo/schema";
```

  - Extend the destructuring to include `faq`:

```astro
const { title, description, pubDate, updatedDate, tags, cover, coverAlt, summary, faq } = post.data;
```

  - After the `breadcrumbNode` declaration (added by Plan 1 Task 8), append:

```astro
const faqNode = buildFaqPageNode({
  canonical,
  items: faq ?? [],
});
```

  - Update the `extraSchemaNodes` prop on `<BaseLayout>` to include `faqNode`. Plan 1 Task 8 set the prop to `[blogPostingNode, breadcrumbNode]`. Replace with:

```astro
extraSchemaNodes={[blogPostingNode, breadcrumbNode, faqNode]}
```

  - In the body block, add `<Faq>` AFTER the post body slot. The post body block currently looks like:

```astro
    {summary && <Tldr text={summary} />}
    <div class="post__body prose">
      <slot />
    </div>
```

  After the closing `</div>`, insert:

```astro
    {faq && faq.length > 0 && <Faq items={faq} />}
```

  (NOTE: `<AuthorCard>` from Plan 2 sits BELOW the `<Faq>` block. `RelatedPosts` from Task 7 will also slot in this region — explicit ordering documented in Task 7.)

- [x] **Step 7:** Run typecheck.

```bash
pnpm typecheck
```
Expected: 0 errors. The `extraSchemaNodes` prop on `BaseLayout` accepts `ReadonlyArray<GraphNode | null>`, so passing a possibly-`null` `faqNode` is type-safe (`buildGraph` filters nulls — verified by Plan 1 Task 6).

- [x] **Step 8:** Run tests.

```bash
pnpm test
```
Expected: all pass.

- [x] **Step 9:** Manual smoke check.

```bash
pnpm dev
```

Temporarily add to `src/content/posts/01-introduction.md` frontmatter:

```yaml
faq:
  - question: Что такое harness?
    answer: Runtime-контейнер, в котором живёт LLM-цикл и tool-loop.
  - question: Зачем skills?
    answer: Файл-инструкция, активируется по триггеру; не съедает токены пока не сработает.
```

Then verify both the visual block and the JSON-LD FAQPage node:

```bash
curl -s http://localhost:4321/blog/01-introduction | grep -c 'class="faq"'
```
Expected: `1`.

```bash
curl -s http://localhost:4321/blog/01-introduction \
  | python3 -c "import sys, re, json; m = re.search(r'<script[^>]+ld\\+json[^>]*>(.+?)</script>', sys.stdin.read(), re.S); g = json.loads(m.group(1).replace('\\\\u003c','<').replace('\\\\u003e','>').replace('\\\\u0026','&')); print([n['@type'] for n in g['@graph']])"
```
Expected: list contains `FAQPage` alongside `Person`, `Organization`, `WebSite`, `BlogPosting`, `BreadcrumbList`. Revert the temporary frontmatter (`git checkout -- src/content/posts/01-introduction.md`). Stop the dev server.

- [x] **Step 10:** Detect changes scope.

```
mcp__gitnexus__detect_changes({ scope: "staged", repo: "astro-blog" })
```
Expected: 4 files — `src/components/mdx/Faq.astro`, `src/components/mdx/index.ts`, `src/layouts/PostLayout.astro`, `tests/unit/mdx/faq.test.ts`.

- [x] **Step 11:** Commit.

```bash
git add src/components/mdx/Faq.astro src/components/mdx/index.ts src/layouts/PostLayout.astro tests/unit/mdx/faq.test.ts
git commit -m "feat(mdx): add <Faq> with auto-render and FAQPage JSON-LD merged into @graph"
```

---

# Phase 4 — Compare, Definition, KeyTakeaways (C4, C5, C6)

### Task 4: `<Compare cols={…} rows={…} verdict="…">` component

**Subagent:** `frontender`

**Files:**
- Create: `src/components/mdx/Compare.astro`
- Modify: `src/components/mdx/index.ts`
- Create: `tests/unit/mdx/compare.test.ts`

- [ ] **Step 1:** Write the failing test.

Create `tests/unit/mdx/compare.test.ts`:

```ts
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Compare from "~/components/mdx/Compare.astro";

const sample = {
  cols: ["Sonnet", "Opus", "Haiku"],
  rows: [
    { label: "Latency p50", values: ["1.2s", "2.4s", "0.5s"] },
    { label: "Cost / 1M tok", values: ["$3", "$15", "$0.80"] },
  ],
  verdict: "Sonnet — лучший дефолт; Opus — для глубокого reasoning; Haiku — для классификации.",
  caption: "Сравнение моделей Claude по латентности и цене",
};

describe("<Compare>", () => {
  it("emits a <figure> wrapping a <table> with header row", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Compare, { props: sample });
    expect(html).toMatch(/<figure[^>]+class="compare"/);
    expect(html).toMatch(/<table\b/);
    expect(html).toMatch(/<thead\b[\s\S]+<th[\s\S]+Sonnet[\s\S]+Opus[\s\S]+Haiku/);
  });

  it("renders one <tr> per row with label as <th scope=\"row\">", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Compare, { props: sample });
    expect(html).toMatch(/<th scope="row"[^>]*>Latency p50<\/th>/);
    expect(html).toMatch(/<th scope="row"[^>]*>Cost \/ 1M tok<\/th>/);
    expect(html).toMatch(/<td[^>]*>\$15<\/td>/);
  });

  it("renders <figcaption> from caption prop", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Compare, { props: sample });
    expect(html).toMatch(/<figcaption[^>]*>Сравнение моделей/);
  });

  it("renders a verdict line below the table", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Compare, { props: sample });
    expect(html).toMatch(/<p[^>]+class="compare__verdict"[^>]*>Sonnet — лучший/);
  });

  it("throws when row.values length mismatches cols length", async () => {
    const bad = {
      cols: ["A", "B"],
      rows: [{ label: "x", values: ["1"] }],
      verdict: "v",
    };
    const container = await AstroContainer.create();
    await expect(container.renderToString(Compare, { props: bad })).rejects.toThrow(
      /column count mismatch/i,
    );
  });
});
```

- [ ] **Step 2:** Run test to confirm failure.

```bash
pnpm test tests/unit/mdx/compare.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3:** Implement `src/components/mdx/Compare.astro`.

```astro
---
/**
 * <Compare cols rows verdict caption>: renders an answer-friendly comparison
 * table. Each row label becomes a `<th scope="row">` so screen readers can
 * speak the label/cell pair. The verdict line lives outside the table so an
 * LLM can quote it as a single sentence.
 *
 * Throws on column/row mismatch — better to fail loudly at build than ship
 * a misaligned table.
 */
interface Row {
  readonly label: string;
  readonly values: ReadonlyArray<string>;
}

interface Props {
  cols: ReadonlyArray<string>;
  rows: ReadonlyArray<Row>;
  verdict: string;
  caption?: string;
}

const { cols, rows, verdict, caption } = Astro.props;

for (const row of rows) {
  if (row.values.length !== cols.length) {
    throw new Error(
      `<Compare>: column count mismatch in row "${row.label}" (` +
        `expected ${cols.length} values for ${cols.length} cols, got ${row.values.length})`,
    );
  }
}
---

<figure class="compare">
  <table>
    {caption && <caption class="compare__caption">{caption}</caption>}
    <thead>
      <tr>
        <th scope="col" />
        {cols.map((c) => <th scope="col">{c}</th>)}
      </tr>
    </thead>
    <tbody>
      {rows.map((r) => (
        <tr>
          <th scope="row">{r.label}</th>
          {r.values.map((v) => <td>{v}</td>)}
        </tr>
      ))}
    </tbody>
  </table>
  {caption && <figcaption>{caption}</figcaption>}
  <p class="compare__verdict">{verdict}</p>
</figure>

<style>
  .compare {
    margin: var(--space-6) 0;
    padding: 0;
  }
  .compare table {
    width: 100%;
    border-collapse: collapse;
    font-family: var(--font-sans);
    font-size: var(--fs-sm);
  }
  .compare__caption {
    caption-side: top;
    text-align: left;
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-fg-muted);
    padding-bottom: var(--space-2);
  }
  .compare th,
  .compare td {
    text-align: left;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .compare thead th {
    font-weight: 500;
    color: var(--color-fg);
    border-bottom: 2px solid var(--color-border);
  }
  .compare tbody th {
    font-weight: 500;
    color: var(--color-fg);
  }
  .compare tbody td {
    color: var(--color-fg-muted);
    font-variant-numeric: tabular-nums;
  }
  .compare figcaption {
    margin-top: var(--space-2);
    font-size: var(--fs-xs);
    color: var(--color-fg-subtle);
  }
  .compare__verdict {
    margin: var(--space-3) 0 0 0;
    font-style: italic;
    color: var(--color-fg);
    border-left: 2px solid var(--color-accent);
    padding-left: var(--space-3);
  }
</style>
```

(Note: `<caption>` is duplicated as `<figcaption>` because LLMs latch onto either; visual chrome shows only `<figcaption>` since `<caption>` is styled `caption-side: top` and is the same text. Acceptable redundancy for retrieval.)

- [ ] **Step 4:** Re-export from the index.

Update `src/components/mdx/index.ts`:

```ts
import Tldr from "./Tldr.astro";
import Faq from "./Faq.astro";
import Compare from "./Compare.astro";

export const mdxComponents = {
  Tldr,
  Faq,
  Compare,
} as const;

export type MdxComponents = typeof mdxComponents;
```

- [ ] **Step 5:** Run tests.

```bash
pnpm test tests/unit/mdx/compare.test.ts && pnpm typecheck
```
Expected: PASS.

- [ ] **Step 6:** Commit.

```bash
git add src/components/mdx/Compare.astro src/components/mdx/index.ts tests/unit/mdx/compare.test.ts
git commit -m "feat(mdx): add <Compare> table with verdict line and a11y row scopes"
```

---

### Task 5: `<Definition term="…">child</Definition>`

**Subagent:** `frontender`

**Files:**
- Create: `src/components/mdx/Definition.astro`
- Modify: `src/components/mdx/index.ts`
- Create: `tests/unit/mdx/definition.test.ts`

- [ ] **Step 1:** Write the failing test.

Create `tests/unit/mdx/definition.test.ts`:

```ts
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import Definition from "~/components/mdx/Definition.astro";

describe("<Definition>", () => {
  it("renders a <dl> with <dt> and <dd>", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Definition, {
      props: { term: "Harness" },
      slots: { default: "Runtime-контейнер LLM-цикла." },
    });
    expect(html).toMatch(/<dl[^>]+class="definition"/);
    expect(html).toMatch(/<dt[^>]*>Harness<\/dt>/);
    expect(html).toMatch(/<dd[^>]*>[\s\S]*Runtime-контейнер[\s\S]*<\/dd>/);
  });

  it("escapes the term to prevent HTML injection", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Definition, {
      props: { term: "<script>alert(1)</script>" },
      slots: { default: "evil" },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toMatch(/&lt;script&gt;/);
  });

  it("renders nothing when term is empty", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(Definition, {
      props: { term: "" },
      slots: { default: "x" },
    });
    expect(html).not.toMatch(/<dl[^>]+class="definition"/);
  });
});
```

- [ ] **Step 2:** Run test to confirm failure.

```bash
pnpm test tests/unit/mdx/definition.test.ts
```
Expected: FAIL.

- [ ] **Step 3:** Implement `src/components/mdx/Definition.astro`.

```astro
---
/**
 * <Definition term="…">child</Definition>: renders a single-pair description list.
 * Used inline in MDX to surface key terms in a structured way that LLMs and
 * screen readers can both parse.
 *
 * Renders nothing when `term` is empty (defensive against typos in MDX bodies).
 */
interface Props {
  term: string;
}

const { term } = Astro.props;
const hasTerm = typeof term === "string" && term.length > 0;
---

{
  hasTerm && (
    <dl class="definition">
      <dt>{term}</dt>
      <dd>
        <slot />
      </dd>
    </dl>
  )
}

<style>
  .definition {
    margin: var(--space-4) 0;
    padding: var(--space-3) var(--space-4);
    border-left: 2px solid var(--color-border);
    background: var(--color-bg-elevated);
    border-radius: var(--radius-sm);
  }
  .definition dt {
    font-family: var(--font-mono);
    font-size: var(--fs-sm);
    font-weight: 500;
    color: var(--color-fg);
    margin: 0 0 var(--space-1) 0;
  }
  .definition dd {
    margin: 0;
    color: var(--color-fg-muted);
    line-height: var(--lh-normal);
  }
  .definition dd p:first-child {
    margin-top: 0;
  }
  .definition dd p:last-child {
    margin-bottom: 0;
  }
</style>
```

- [ ] **Step 4:** Re-export.

Update `src/components/mdx/index.ts`:

```ts
import Tldr from "./Tldr.astro";
import Faq from "./Faq.astro";
import Compare from "./Compare.astro";
import Definition from "./Definition.astro";

export const mdxComponents = {
  Tldr,
  Faq,
  Compare,
  Definition,
} as const;

export type MdxComponents = typeof mdxComponents;
```

- [ ] **Step 5:** Run tests.

```bash
pnpm test tests/unit/mdx/definition.test.ts && pnpm typecheck
```
Expected: PASS.

- [ ] **Step 6:** Commit.

```bash
git add src/components/mdx/Definition.astro src/components/mdx/index.ts tests/unit/mdx/definition.test.ts
git commit -m "feat(mdx): add <Definition> component with <dl><dt><dd> markup"
```

---

### Task 6: `<KeyTakeaways items={[…]}>`

**Subagent:** `frontender`

**Files:**
- Create: `src/components/mdx/KeyTakeaways.astro`
- Modify: `src/components/mdx/index.ts`
- Create: `tests/unit/mdx/key-takeaways.test.ts`

- [ ] **Step 1:** Write the failing test.

Create `tests/unit/mdx/key-takeaways.test.ts`:

```ts
import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { describe, expect, it } from "vitest";
import KeyTakeaways from "~/components/mdx/KeyTakeaways.astro";

const items = [
  "harness ≠ agent — это контейнер для агентного цикла",
  "skills грузятся по триггеру и не жгут токены вхолостую",
  "subagent-ы заводи только когда summary важнее транскрипта",
];

describe("<KeyTakeaways>", () => {
  it("renders an <ul> with one <li> per takeaway", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(KeyTakeaways, { props: { items } });
    const liCount = (html.match(/<li\b/g) ?? []).length;
    expect(liCount).toBe(3);
    expect(html).toContain("harness ≠ agent");
    expect(html).toContain("skills грузятся по триггеру");
  });

  it("uses an aside with labelled section semantics", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(KeyTakeaways, { props: { items } });
    expect(html).toMatch(/<aside[^>]+class="takeaways"/);
    expect(html).toMatch(/aria-label/);
  });

  it("warns at build time when items count is outside 3-5", async () => {
    const container = await AstroContainer.create();
    await expect(
      container.renderToString(KeyTakeaways, { props: { items: ["one"] } }),
    ).rejects.toThrow(/3.*5 takeaways/i);
    await expect(
      container.renderToString(KeyTakeaways, {
        props: { items: ["a", "b", "c", "d", "e", "f"] },
      }),
    ).rejects.toThrow(/3.*5 takeaways/i);
  });

  it("accepts a custom title prop", async () => {
    const container = await AstroContainer.create();
    const html = await container.renderToString(KeyTakeaways, {
      props: { items, title: "Главное" },
    });
    expect(html).toContain("Главное");
  });
});
```

- [ ] **Step 2:** Run test to confirm failure.

```bash
pnpm test tests/unit/mdx/key-takeaways.test.ts
```
Expected: FAIL.

- [ ] **Step 3:** Implement `src/components/mdx/KeyTakeaways.astro`.

```astro
---
/**
 * <KeyTakeaways items={[…]} title="Главное"?>: 3-5 punchy bullets summarising
 * the post. Visual emphasis (high contrast, top of body or end of long
 * sections) signals a quote-ready chunk to crawlers and humans alike.
 *
 * Throws when items.length is outside [3, 5] — keeps the format honest.
 */
interface Props {
  items: ReadonlyArray<string>;
  title?: string;
}

const { items, title = "Key takeaways" } = Astro.props;

if (items.length < 3 || items.length > 5) {
  throw new Error(
    `<KeyTakeaways>: expected 3–5 takeaways, got ${items.length}. ` +
      `Drop weak ones or merge thin ones — the format only works as a tight list.`,
  );
}
---

<aside class="takeaways" aria-label={title}>
  <p class="takeaways__label">{title}</p>
  <ul class="takeaways__list">
    {items.map((it) => <li>{it}</li>)}
  </ul>
</aside>

<style>
  .takeaways {
    margin: var(--space-6) 0;
    padding: var(--space-4) var(--space-5);
    background: var(--color-bg-elevated);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
  }
  .takeaways__label {
    font-family: var(--font-mono);
    font-size: var(--fs-xs);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-fg-muted);
    margin: 0 0 var(--space-3) 0;
  }
  .takeaways__list {
    margin: 0;
    padding: 0 0 0 var(--space-4);
    list-style: "→  ";
    color: var(--color-fg);
  }
  .takeaways__list li {
    margin: var(--space-2) 0;
    line-height: var(--lh-normal);
  }
  .takeaways__list li::marker {
    color: var(--color-accent);
    font-family: var(--font-mono);
  }
</style>
```

- [ ] **Step 4:** Re-export.

Update `src/components/mdx/index.ts`:

```ts
import Tldr from "./Tldr.astro";
import Faq from "./Faq.astro";
import Compare from "./Compare.astro";
import Definition from "./Definition.astro";
import KeyTakeaways from "./KeyTakeaways.astro";

export const mdxComponents = {
  Tldr,
  Faq,
  Compare,
  Definition,
  KeyTakeaways,
} as const;

export type MdxComponents = typeof mdxComponents;
```

- [ ] **Step 5:** Run tests.

```bash
pnpm test tests/unit/mdx && pnpm typecheck
```
Expected: PASS — five component test files all green.

- [ ] **Step 6:** End-of-Phase critic review.

Dispatch `critic` subagent to review:
- `src/components/mdx/*.astro`
- `src/components/mdx/index.ts`
- All five new test files under `tests/unit/mdx/`
- The two `<Tldr>` + `<Faq>` insertion points in `PostLayout.astro`

Expected feedback dimensions: a11y (aria labels, scopes), CSS token reuse vs hardcoded values, component name collisions with author MDX, type strictness (`exactOptionalPropertyTypes` is enabled — props with `?` must not be passed `undefined` explicitly), and check that `<Content components={mdxComponents} />` correctly forwards the map (verify by inspecting one of the page templates from Task 2 Step 7).

Address any blocking findings before continuing. Non-blocking nits go to `notes/critic-deferred.md`.

- [ ] **Step 7:** Commit.

```bash
git add src/components/mdx/KeyTakeaways.astro src/components/mdx/index.ts tests/unit/mdx/key-takeaways.test.ts
git commit -m "feat(mdx): add <KeyTakeaways> component with 3–5 bullet guard"
```

---

# Phase 5 — Related posts (C7)

### Task 7: Related posts — top-3 by Jaccard tag overlap, same locale

**Subagent:** `backender` for `src/lib/related.ts`; `frontender` wires it into `PostLayout.astro`

**Files:**
- Create: `src/lib/related.ts`
- Create: `tests/unit/related/related.test.ts`
- Modify: `src/layouts/PostLayout.astro`

- [ ] **Step 1:** Write the failing test for the pure function.

Create `tests/unit/related/related.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { jaccard, pickRelated, type RelatedCandidate } from "~/lib/related";

describe("jaccard", () => {
  it("returns 1 for identical sets", () => {
    expect(jaccard(["a", "b"], ["b", "a"])).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    expect(jaccard(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns intersection / union for partial overlap", () => {
    // |{a,b}| ∩ |{a,c,d}| = 1; union = 4 → 0.25
    expect(jaccard(["a", "b"], ["a", "c", "d"])).toBeCloseTo(0.25);
  });

  it("returns 0 when both sets are empty (avoids NaN)", () => {
    expect(jaccard([], [])).toBe(0);
  });

  it("ignores duplicate tags within a single side", () => {
    // {a,b} vs {a} → intersection 1, union 2 → 0.5
    expect(jaccard(["a", "a", "b"], ["a"])).toBe(0.5);
  });
});

describe("pickRelated", () => {
  const ru = (slug: string, tags: string[], date = "2026-04-01"): RelatedCandidate => ({
    slug,
    locale: "ru",
    tags,
    pubDate: new Date(date),
    title: slug,
    description: `${slug} desc`,
  });

  const en = (slug: string, tags: string[], date = "2026-04-01"): RelatedCandidate => ({
    slug,
    locale: "en",
    tags,
    pubDate: new Date(date),
    title: slug,
    description: `${slug} desc`,
  });

  it("returns top-3 by Jaccard score, descending", () => {
    const current = ru("current", ["claude", "skills", "hooks"]);
    const all = [
      current,
      ru("a", ["claude", "skills"]), // 2/3
      ru("b", ["claude"]), // 1/3
      ru("c", ["claude", "hooks", "subagents"]), // 2/4
      ru("d", ["mcp"]), // 0
      ru("e", ["claude", "skills", "hooks"]), // identical → 1.0
    ];
    const out = pickRelated({ current, all, limit: 3 });
    expect(out.map((p) => p.slug)).toEqual(["e", "a", "c"]);
  });

  it("excludes the current post even if tags identical", () => {
    const current = ru("current", ["x"]);
    const all = [current, ru("other", ["x"])];
    const out = pickRelated({ current, all, limit: 3 });
    expect(out.map((p) => p.slug)).toEqual(["other"]);
  });

  it("filters out posts of a different locale", () => {
    const current = ru("ru-cur", ["x", "y"]);
    const all = [
      current,
      en("en-twin", ["x", "y"]), // identical tags but EN — must be excluded
      ru("ru-other", ["x"]),
    ];
    const out = pickRelated({ current, all, limit: 3 });
    expect(out.map((p) => p.slug)).toEqual(["ru-other"]);
  });

  it("breaks ties by pubDate desc (newer wins)", () => {
    const current = ru("c", ["x"]);
    const all = [
      current,
      ru("older", ["x"], "2026-01-01"),
      ru("newer", ["x"], "2026-04-01"),
    ];
    const out = pickRelated({ current, all, limit: 3 });
    expect(out.map((p) => p.slug)).toEqual(["newer", "older"]);
  });

  it("returns empty list when current has no tags", () => {
    const current = ru("c", []);
    const all = [current, ru("a", ["x"]), ru("b", ["y"])];
    expect(pickRelated({ current, all, limit: 3 })).toEqual([]);
  });

  it("returns empty list when no candidate shares any tag", () => {
    const current = ru("c", ["x"]);
    const all = [current, ru("a", ["y"]), ru("b", ["z"])];
    expect(pickRelated({ current, all, limit: 3 })).toEqual([]);
  });

  it("respects the limit", () => {
    const current = ru("c", ["x"]);
    const all = [
      current,
      ru("a", ["x"]),
      ru("b", ["x"]),
      ru("c2", ["x"]),
      ru("d", ["x"]),
    ];
    const out = pickRelated({ current, all, limit: 3 });
    expect(out.length).toBe(3);
  });
});
```

- [ ] **Step 2:** Run test to confirm failure.

```bash
pnpm test tests/unit/related/related.test.ts
```
Expected: FAIL — module does not exist.

- [ ] **Step 3:** Implement `src/lib/related.ts`.

```ts
/**
 * Related-posts selection. Pure functions only — no Astro / DB / IO.
 *
 * `pickRelated` ranks candidates by Jaccard similarity of tag sets, filtered
 * to the same locale as the current post, and returns the top-`limit` posts
 * sorted (similarity desc, pubDate desc). Cross-locale leakage is the single
 * biggest correctness risk — covered by an explicit test.
 */

export type Locale = "ru" | "en";

export interface RelatedCandidate {
  readonly slug: string;
  readonly locale: Locale;
  readonly tags: ReadonlyArray<string>;
  readonly pubDate: Date;
  readonly title: string;
  readonly description: string;
}

export interface PickRelatedInput {
  readonly current: RelatedCandidate;
  readonly all: ReadonlyArray<RelatedCandidate>;
  readonly limit: number;
}

/** Jaccard set similarity. Empty/empty returns 0 (avoiding NaN). */
export const jaccard = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): number => {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

interface Scored {
  readonly candidate: RelatedCandidate;
  readonly score: number;
}

export const pickRelated = (input: PickRelatedInput): ReadonlyArray<RelatedCandidate> => {
  const { current, all, limit } = input;
  if (current.tags.length === 0) return [];

  const scored: Scored[] = [];
  for (const cand of all) {
    if (cand.slug === current.slug) continue;
    if (cand.locale !== current.locale) continue;
    const score = jaccard(current.tags, cand.tags);
    if (score <= 0) continue;
    scored.push({ candidate: cand, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return b.candidate.pubDate.getTime() - a.candidate.pubDate.getTime();
  });

  return scored.slice(0, limit).map((s) => s.candidate);
};
```

- [ ] **Step 4:** Run unit tests.

```bash
pnpm test tests/unit/related/related.test.ts
```
Expected: PASS — all 13 assertions green.

- [ ] **Step 5:** Run impact analysis on `PostLayout` before wiring.

```
mcp__gitnexus__impact({ target: "PostLayout", direction: "upstream", repo: "astro-blog" })
```
Expected: MEDIUM — same as Task 2.

- [ ] **Step 6:** Wire `RelatedPosts` into `PostLayout.astro`.

Open `src/layouts/PostLayout.astro`. Add to the imports:

```astro
import { pickRelated, type RelatedCandidate } from "~/lib/related";
import { getOrderedPosts } from "~/lib/content/loader";
```

Below the existing locale/canonical/blogPostingNode block, add a related-posts computation:

```astro
const allPosts = await getOrderedPosts({ locale });
const currentCandidate: RelatedCandidate = {
  slug: post.id.replace(/^en\//, ""),
  locale,
  tags: tags ?? [],
  pubDate,
  title,
  description,
};
const candidates: ReadonlyArray<RelatedCandidate> = allPosts.map((p) => ({
  slug: p.entry.id.replace(/^en\//, ""),
  locale,
  tags: p.entry.data.tags ?? [],
  pubDate: p.entry.data.pubDate,
  title: p.entry.data.title,
  description: p.entry.data.description,
}));
const related = pickRelated({ current: currentCandidate, all: candidates, limit: 3 });
const blogPathPrefix = locale === "en" ? "/en/blog" : "/blog";
```

In the body block, BETWEEN the `<Faq>` block (Task 3) and the `<AuthorCard />` (Plan 2), insert:

```astro
    {related.length > 0 && (
      <aside class="related" aria-label={t(locale, "post.related")}>
        <h2 class="related__title">{t(locale, "post.related")}</h2>
        <ul class="related__list">
          {related.map((r) => (
            <li>
              <a href={`${blogPathPrefix}/${r.slug}`} class="related__link">
                <span class="related__post-title">{r.title}</span>
                <span class="related__post-desc">{r.description}</span>
              </a>
            </li>
          ))}
        </ul>
      </aside>
    )}
```

Add corresponding styles inside the existing `<style>` block:

```css
.related {
  margin: var(--space-7) 0 var(--space-6) 0;
  padding-top: var(--space-5);
  border-top: 1px solid var(--color-border);
}
.related__title {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--color-fg-muted);
  margin: 0 0 var(--space-3) 0;
}
.related__list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: var(--space-3);
}
.related__link {
  display: block;
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  text-decoration: none;
  color: var(--color-fg);
  transition: border-color var(--dur-fast) var(--ease-out);
}
.related__link:hover {
  border-color: var(--color-accent);
}
.related__post-title {
  display: block;
  font-family: var(--font-serif);
  font-size: var(--fs-base);
  font-weight: 500;
  margin-bottom: var(--space-1);
}
.related__post-desc {
  display: block;
  font-size: var(--fs-sm);
  color: var(--color-fg-muted);
  line-height: var(--lh-normal);
}
```

- [ ] **Step 7:** Add the `post.related` i18n key.

Open `src/i18n/strings.ru.json` and add (preserving alphabetical key order):

```json
"post.related": "Похожие посты"
```

The translation script (per Plan 1 baseline) will pick this up next time `pnpm translate` runs and write the EN twin into `src/i18n/strings.en.json`. For this PR, also add the EN entry manually so we don't ship a half-locale state:

Open `src/i18n/strings.en.json` and add:

```json
"post.related": "Related posts"
```

- [ ] **Step 8:** Run typecheck.

```bash
pnpm typecheck
```
Expected: 0 errors. (`getOrderedPosts` is already async; `PostLayout.astro` frontmatter runs at build/SSR time so awaiting works.)

- [ ] **Step 9:** Run all tests.

```bash
pnpm test
```
Expected: all pass.

- [ ] **Step 10:** Manual smoke check.

```bash
pnpm dev
```

```bash
curl -s http://localhost:4321/blog/01-introduction | grep -c 'class="related"'
```
Expected: `1`. Visit a post and confirm the "Похожие посты" section shows up to three cards. Switch to EN by visiting `/en/blog/01-introduction` and confirm titles/descriptions are EN — never RU. Stop the dev server.

- [ ] **Step 11:** Detect changes scope.

```
mcp__gitnexus__detect_changes({ scope: "staged", repo: "astro-blog" })
```
Expected: 5 files — `src/lib/related.ts`, `tests/unit/related/related.test.ts`, `src/layouts/PostLayout.astro`, `src/i18n/strings.ru.json`, `src/i18n/strings.en.json`.

- [ ] **Step 12:** Commit.

```bash
git add src/lib/related.ts tests/unit/related/related.test.ts src/layouts/PostLayout.astro src/i18n/strings.ru.json src/i18n/strings.en.json
git commit -m "feat(retrieval): add RelatedPosts (top-3 Jaccard tag overlap, same locale)"
```

---

# Phase 6 — Translation pipeline pass-through (supporting C1)

### Task 8: Pass `summary`, `keywords`, `faq`, `lang` through `scripts/translate.ts`

**Subagent:** `backender`

**Files:**
- Modify: `scripts/translate.ts`
- Create: `scripts/translate.summary-faq.test.ts`

This task ensures the existing translation pipeline doesn't strip the new frontmatter fields. The script currently only translates `title`, `description`, and optionally `coverAlt`, then reassembles the body. After Task 1 the post schema permits `summary`, `keywords`, `faq`, and `lang`, but the script's `serializeWithExtras` builds an explicit object from `Frontmatter` (typed in `src/lib/content/frontmatter.ts`) and so silently drops everything outside that type.

We do TWO things:
1. Translate `summary` and each `faq[].question` / `faq[].answer` as prose (use the existing `translateStrings` helper).
2. Pass `keywords` and `lang` verbatim to the EN file.

- [ ] **Step 1:** Run impact analysis.

```
mcp__gitnexus__impact({ target: "translateFile", direction: "upstream", repo: "astro-blog" })
```
Expected: contained — only called by `translateAllPosts` which is called by `main`. LOW.

- [ ] **Step 2:** Read `src/lib/content/frontmatter.ts` and confirm the `Frontmatter` interface needs to be extended for the new fields to round-trip.

```bash
grep -A 20 "interface Frontmatter" src/lib/content/frontmatter.ts
```

- [ ] **Step 3:** Extend `src/lib/content/frontmatter.ts`. Add to the `Frontmatter` interface:

```ts
readonly summary?: string;
readonly keywords?: ReadonlyArray<string>;
readonly faq?: ReadonlyArray<{ readonly question: string; readonly answer: string }>;
readonly lang?: "ru" | "en";
```

In `parseFrontmatter`, extend the constructed object after the `coverAlt` line:

```ts
...(typeof parsed["summary"] === "string" ? { summary: parsed["summary"] } : {}),
...(Array.isArray(parsed["keywords"])
  ? { keywords: (parsed["keywords"] as unknown[]).map(String) }
  : {}),
...(Array.isArray(parsed["faq"])
  ? {
      faq: (parsed["faq"] as Array<Record<string, unknown>>).map((it) => ({
        question: String(it["question"] ?? ""),
        answer: String(it["answer"] ?? ""),
      })),
    }
  : {}),
...(parsed["lang"] === "ru" || parsed["lang"] === "en" ? { lang: parsed["lang"] } : {}),
```

In `serializeFrontmatter`, extend the dumped object:

```ts
...(fm.summary ? { summary: fm.summary } : {}),
...(fm.keywords && fm.keywords.length > 0 ? { keywords: [...fm.keywords] } : {}),
...(fm.faq && fm.faq.length > 0 ? { faq: fm.faq.map((it) => ({ ...it })) } : {}),
...(fm.lang ? { lang: fm.lang } : {}),
```

(Frontmatter is also used by `src/lib/content/post-io.ts`. The existing tests for that module must still pass — re-run them at Step 6.)

- [ ] **Step 4:** Modify `scripts/translate.ts` (function `translateFile`):

  - In the `fmStrings` block (line ~123), add `summary` if present:

```ts
const fmStrings: Record<string, string> = {
  title: ruMeta.title,
  description: ruMeta.description,
  ...(ruMeta.coverAlt ? { coverAlt: ruMeta.coverAlt } : {}),
  ...(ruMeta.summary ? { summary: ruMeta.summary } : {}),
};
```

  - After the existing `fmTranslated` block, translate FAQ items if present:

```ts
const faqTranslated: ReadonlyArray<{ question: string; answer: string }> | null =
  ruMeta.faq && ruMeta.faq.length > 0
    ? await (async () => {
        const flat: Record<string, string> = {};
        ruMeta.faq!.forEach((it, i) => {
          flat[`q${i}`] = it.question;
          flat[`a${i}`] = it.answer;
        });
        const t = await translateStrings({
          apiKey: apiKey!,
          sourceLocale: "ru",
          targetLocale: "en",
          strings: flat,
        });
        return ruMeta.faq!.map((_, i) => ({
          question: t[`q${i}`] ?? ruMeta.faq![i]!.question,
          answer: t[`a${i}`] ?? ruMeta.faq![i]!.answer,
        }));
      })()
    : null;
```

  - Update the `enMeta` build to include the translated `summary`, the verbatim `keywords`, the translated `faq`, and explicit `lang: "en"`:

```ts
const enMeta: Frontmatter = {
  ...ruMeta,
  title: fmTranslated["title"] ?? ruMeta.title,
  description: fmTranslated["description"] ?? ruMeta.description,
  ...(fmTranslated["coverAlt"] ? { coverAlt: fmTranslated["coverAlt"] } : {}),
  ...(fmTranslated["summary"] ? { summary: fmTranslated["summary"] } : {}),
  ...(ruMeta.keywords ? { keywords: ruMeta.keywords } : {}),
  ...(faqTranslated ? { faq: faqTranslated } : {}),
  lang: "en",
};
```

  - Update `serializeWithExtras` (defined at the top of `scripts/translate.ts`) so the dumped object includes the new fields. Replace its `obj` construction with:

```ts
const obj: Record<string, unknown> = {
  title: base.title,
  description: truncateDesc(base.description),
  pubDate: base.pubDate.toISOString().slice(0, 10),
  ...(base.updatedDate ? { updatedDate: base.updatedDate.toISOString().slice(0, 10) } : {}),
  tags: base.tags,
  draft: base.draft,
  ...(base.cover ? { cover: base.cover } : {}),
  ...(base.coverAlt ? { coverAlt: base.coverAlt } : {}),
  ...(base.summary ? { summary: base.summary } : {}),
  ...(base.keywords && base.keywords.length > 0 ? { keywords: [...base.keywords] } : {}),
  ...(base.faq && base.faq.length > 0 ? { faq: base.faq.map((it) => ({ ...it })) } : {}),
  ...(base.lang ? { lang: base.lang } : {}),
  ...extras,
};
```

- [ ] **Step 5:** Write a unit test that smoke-checks the parser/serializer round-trip including the new fields. Create `scripts/translate.summary-faq.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseFrontmatter, serializeFrontmatter } from "../src/lib/content/frontmatter";

const sample = `---
title: Sample
description: Short description for the sample post used by tests.
pubDate: 2026-05-15
tags:
  - claude-code
  - skills
draft: false
summary: Краткий тезис в 60 символов и больше — это нужно для теста.
keywords:
  - harness
  - skills
faq:
  - question: Что такое harness?
    answer: Это runtime-контейнер. Здесь должно быть достаточно символов чтобы пройти валидацию.
  - question: Что такое skill?
    answer: Файл-инструкция. Здесь должно быть достаточно символов чтобы пройти валидацию.
lang: ru
---

Body text.
`;

describe("frontmatter round-trip — extended fields", () => {
  it("parses summary, keywords, faq, lang", () => {
    const { frontmatter } = parseFrontmatter(sample);
    expect(frontmatter.summary).toContain("Краткий тезис");
    expect(frontmatter.keywords).toEqual(["harness", "skills"]);
    expect(frontmatter.faq).toHaveLength(2);
    expect(frontmatter.faq?.[0]?.question).toBe("Что такое harness?");
    expect(frontmatter.lang).toBe("ru");
  });

  it("serialises round-trip without losing the new fields", () => {
    const { frontmatter, body } = parseFrontmatter(sample);
    const out = serializeFrontmatter(frontmatter, body);
    const reparsed = parseFrontmatter(out).frontmatter;
    expect(reparsed.summary).toBe(frontmatter.summary);
    expect(reparsed.keywords).toEqual(frontmatter.keywords);
    expect(reparsed.faq).toEqual(frontmatter.faq);
    expect(reparsed.lang).toBe("ru");
  });
});
```

- [ ] **Step 6:** Run the new test plus the existing frontmatter tests.

```bash
pnpm test src/lib/content/frontmatter.test.ts scripts/translate.summary-faq.test.ts src/lib/content/post-io.test.ts
```
Expected: all pass — round-trip is lossless.

- [ ] **Step 7:** Run the full test suite + typecheck.

```bash
pnpm test && pnpm typecheck
```
Expected: all green.

- [ ] **Step 8:** Document the new fields in the script header comment.

In `scripts/translate.ts`, add to the file-top comment (or create one) documenting that the script now translates `summary` and `faq[].question`/`faq[].answer`, and passes `keywords`/`lang` through verbatim. Example header (lines 1-5):

```ts
// scripts/translate.ts — RU → EN translator for posts and site content.
// Translates: title, description, coverAlt, summary, faq[].question/answer (prose).
// Passes through verbatim: keywords (slug-like), tags, cover, pubDate, updatedDate.
// Always sets lang: "en" on EN twins. Skips drafts. Per-key hash tracking for the
// i18n string catalog avoids re-translating unchanged values.
```

- [ ] **Step 9:** Commit.

```bash
git add src/lib/content/frontmatter.ts scripts/translate.ts scripts/translate.summary-faq.test.ts
git commit -m "feat(translate): pass through summary, keywords, faq, lang in RU→EN pipeline"
```

---

# Phase 7 — Verification

### Task 9: End-to-end build, schema graph audit, CLAUDE.md update

**Subagent:** `critic` (review-only); `backender` for the CLAUDE.md edit

**Files:**
- Modify: `CLAUDE.md` (one-line pointer to MDX components convention)

- [ ] **Step 1:** Run a sample-post end-to-end check by adding TEMPORARY frontmatter to one RU post.

Edit `src/content/posts/01-introduction.md` frontmatter (we'll revert before commit). Add:

```yaml
summary: TL;DR — это пилотная статья проверяющая retrieval-компоненты для LLM.
keywords:
  - harness
  - claude-code
faq:
  - question: Что такое harness?
    answer: Runtime-контейнер для LLM-цикла. Содержит prompt, tools, history, hooks.
  - question: Зачем skills?
    answer: Skills грузятся по триггеру и не съедают токены, пока не активированы.
lang: ru
```

- [ ] **Step 2:** Full build.

```bash
pnpm build
```
Expected: 0 errors. Pagefind regenerates without warnings.

- [ ] **Step 3:** Validate `<Tldr>` and `<Faq>` rendered into the static HTML.

```bash
grep -c 'class="tldr"' dist/client/blog/01-introduction/index.html
grep -c 'class="faq"' dist/client/blog/01-introduction/index.html
grep -c 'class="related"' dist/client/blog/01-introduction/index.html
```
Expected: `1`, `1`, `0 or 1` — `related` is `1` only if other posts share tags with `01-introduction`.

- [ ] **Step 4:** Validate the `@graph` includes `FAQPage` (via `buildFaqPageNode`) connected to the existing `BlogPosting`/`Person` graph.

```bash
node -e "const {readFileSync}=require('fs'); const html=readFileSync('dist/client/blog/01-introduction/index.html','utf8'); const m=html.match(/<script[^>]+ld\\+json[^>]*>([\\s\\S]+?)<\\/script>/); const g=JSON.parse(m[1].replace(/\\\\u003c/g,'<').replace(/\\\\u003e/g,'>').replace(/\\\\u0026/g,'&')); console.log('types:', g['@graph'].map(n=>n['@type'])); const faq=g['@graph'].find(n=>n['@type']==='FAQPage'); console.log('faq questions:', faq && faq.mainEntity.length);"
```
Expected:
- `types` includes `Person`, `Organization`, `WebSite`, `BlogPosting`, `BreadcrumbList`, `FAQPage`.
- `faq questions: 2`.

- [ ] **Step 5:** Validate cross-locale isolation by checking the EN twin.

```bash
node -e "const {readFileSync}=require('fs'); const html=readFileSync('dist/client/en/blog/01-introduction/index.html','utf8'); const re=/<a[^>]+class=\"related__link\"[^>]+href=\"([^\"]+)\"/g; const hrefs=[]; let m; while((m=re.exec(html))) hrefs.push(m[1]); console.log('related hrefs:', hrefs); const bad=hrefs.filter(h=>!h.startsWith('/en/')); console.log('cross-locale leakage:', bad.length===0?'NONE':bad);"
```
Expected: `cross-locale leakage: NONE`. (If RU posts leaked into EN related list this fails — fix the locale filter in `pickRelated`.)

- [ ] **Step 6:** Confirm exactly one JSON-LD block per page (Plan 1 invariant must still hold).

```bash
grep -ro 'application/ld+json' dist/client | awk -F: '{print $1}' | sort | uniq -c | awk '$1 > 1 { print "DUPLICATE:", $0; exit 1 }'; echo "OK if no DUPLICATE printed"
```
Expected: `OK if no DUPLICATE printed`.

- [ ] **Step 7:** Run `pnpm translate` in dry-mode-ish by using the existing `translate:check` (does not call the API).

```bash
pnpm translate:check
```
Expected: passes — no drift between RU and EN twins (since we haven't yet committed any new RU summaries).

- [ ] **Step 8:** Revert the temporary `01-introduction.md` edit.

```bash
git checkout -- src/content/posts/01-introduction.md
```

- [ ] **Step 9:** Final tests + lint + typecheck.

```bash
pnpm test && pnpm typecheck && pnpm lint
```
Expected: all green.

- [ ] **Step 10:** Update `CLAUDE.md` with a note about the MDX component convention.

Open `CLAUDE.md`. Under «Стандарты кода» → «Astro» (around the `Islands (React/Svelte) — только если нужна клиентская интерактивность.` line), append:

```markdown
- MDX retrieval-components (`<Tldr>`, `<Faq>`, `<Compare>`, `<Definition>`, `<KeyTakeaways>`)
  are auto-injected via `src/components/mdx/index.ts` and `<Content components={mdxComponents} />`
  in the slug pages. Authors use them as global tags in `.md`/`.mdx` posts — no per-file imports.
  Capitalised names; collision risk documented in spec
  `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md`.
```

- [ ] **Step 11:** Run change-detection.

```
mcp__gitnexus__detect_changes({ scope: "all", repo: "astro-blog" })
```
Expected scope (compared to `main`):
- `src/content.config.ts`
- `src/components/mdx/{Tldr,Faq,Compare,Definition,KeyTakeaways}.astro`
- `src/components/mdx/index.ts`
- `src/layouts/PostLayout.astro`
- `src/pages/blog/[...slug].astro`
- `src/pages/en/blog/[...slug].astro`
- `src/lib/related.ts`
- `src/lib/content/frontmatter.ts`
- `src/i18n/strings.ru.json`
- `src/i18n/strings.en.json`
- `scripts/translate.ts`
- `tests/unit/content/schema.test.ts`
- `tests/unit/mdx/{tldr,faq,compare,definition,key-takeaways}.test.ts`
- `tests/unit/related/related.test.ts`
- `scripts/translate.summary-faq.test.ts`
- `CLAUDE.md`

Flag anything outside that list before committing.

- [ ] **Step 12:** Final commit + critic review.

```bash
git add CLAUDE.md
git commit -m "docs(mdx): document auto-injected retrieval components in CLAUDE.md"
```

Dispatch `critic` subagent to review the entire branch diff against the spec section "Retrieval-layer details". Address blockers before opening the PR.

- [ ] **Step 13:** Push branch and open PR.

```bash
git push -u origin feat/llm-retrieval-components
gh pr create --title "feat(retrieval): MDX components, frontmatter, related posts (EPIC C)" --body "$(cat <<'EOF'
## Summary
- Extend post zod schema with summary, keywords, faq, lang (back-compat optional)
- Add five MDX components: Tldr, Faq, Compare, Definition, KeyTakeaways
  (auto-injected globally; authors use as tags without per-file imports)
- PostLayout auto-renders <Tldr> from frontmatter.summary above body and
  <Faq> from frontmatter.faq below body, plus FAQPage JSON-LD merged into
  the @graph (Plan 1 invariant: one ld+json per page).
- RelatedPosts: top-3 by Jaccard tag overlap, same locale, build-time
  computation, zero JS.
- Translation pipeline (scripts/translate.ts) translates summary +
  faq[].question/answer; passes keywords/lang verbatim.

Spec: docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md (EPIC C)
Plan: docs/superpowers/plans/2026-05-02-plan-3-retrieval-components.md

## Test plan
- [ ] pnpm typecheck passes
- [ ] pnpm test passes (10 new test files: schema + 5 MDX + related + translate
      round-trip + content schema cutoff guard)
- [ ] pnpm build emits FAQPage in @graph when frontmatter.faq is present
- [ ] curl /en/blog/<slug> shows zero RU posts in related (cross-locale check)
- [ ] schema.org validator (manual): paste rendered post, confirm 0 errors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Self-Review

**Spec coverage (EPIC C, sections "Retrieval-layer details" + "MDX components" + "Auto-render behavior in PostLayout"):**

| Spec item | Implemented in |
|---|---|
| **C1** — extend zod schema with `summary`, `keywords[]`, `faq[]`, `lang` | Phase 1 (Task 1) |
| **C2** — `<Tldr>` MDX component + auto-render | Phase 2 (Task 2) |
| **C3** — `<Faq>` + FAQPage JSON-LD into @graph | Phase 3 (Task 3) |
| **C4** — `<Compare cols rows verdict>` | Phase 4 (Task 4) |
| **C5** — `<Definition term>` → `<dl><dt><dd>` | Phase 4 (Task 5) |
| **C6** — `<KeyTakeaways items>` 3–5 bullets | Phase 4 (Task 6) |
| **C7** — RelatedPosts top-3 Jaccard, same locale | Phase 5 (Task 7) |
| Auto-injection mechanism | Task 2 Step 5–7 (`src/components/mdx/index.ts` + `<Content components={mdxComponents} />` in slug pages) |
| Translation pipeline pass-through | Phase 6 (Task 8) |
| End-to-end verification | Phase 7 (Task 9) |

**Type consistency check:**
- `Locale` — used in `src/lib/related.ts` as `"ru" | "en"` (matches `~/lib/seo/nodes-global.ts` from Plan 1; both are local string-literal unions, no cross-import to avoid layering whiplash).
- `RelatedCandidate` — defined once in `src/lib/related.ts`, consumed only by `PostLayout.astro` (Task 7 Step 6).
- `mdxComponents` — central re-export in `src/components/mdx/index.ts`, consumed by both `src/pages/blog/[...slug].astro` and `src/pages/en/blog/[...slug].astro` (Task 2 Step 7) and by `PostLayout.astro` (Task 2 Step 6, the import is currently unused there but kept reachable for future inline use; remove if `pnpm lint` flags it).
- `Frontmatter` — extended in `src/lib/content/frontmatter.ts` (Task 8 Step 3); the four new fields (`summary?`, `keywords?`, `faq?`, `lang?`) are all `readonly` with `?` markers consistent with the existing style.
- `buildFaqPageNode` — same shape as Plan 1 Task 4 (`{ canonical, items }` → `FAQPage | null`), called once in `PostLayout.astro` (Task 3 Step 6) and filtered automatically by `buildGraph` (Plan 1 Task 6 invariant — verified by Plan 1's own test).
- `extraSchemaNodes` — prop name identical to Plan 1 Task 7 (`BaseLayout`) and Task 8 (`PostLayout`); we just append `faqNode` to the existing array.

**Placeholder scan:** every step contains the actual file content or shell command. No `TODO/TBD/implement later` markers. The temporary `01-introduction.md` edits in Tasks 2 Step 10, 3 Step 9, 7 Step 10, and 9 Step 1 are explicit smoke checks with paired `git checkout --` reverts before commit; they do not enter the repo.

**Cross-locale safety:** Task 7 Step 1 includes a dedicated `pickRelated` test that filters out an EN twin even when its tags are identical to the current RU post. Task 9 Step 5 re-confirms this at the rendered-HTML level. Failure here is the single biggest correctness risk; both tests must stay green.

**Back-compat safety:** Task 1's schema extension uses `.optional()` on every new field. The Vitest test (`tests/unit/content/schema.test.ts`) splits posts by `pubDate` cutoff (2026-05-02). Existing 14 RU + 14 EN posts pass without modification; only posts published after the cutoff will trip the `summary`-required guard.

**One JSON-LD per page invariant:** Task 9 Step 6 re-runs the Plan 1 Task 13 invariant check that no rendered HTML contains more than one `application/ld+json` block. The `FAQPage` node enters the existing single block via `extraSchemaNodes`, never as a second script tag.

**MDX auto-injection — choice rationale:**
We chose **`<Content components={mdxComponents} />` in the slug page templates** over **`astro.config.ts` MDX `components` option** because:
1. The latter is documented but applies globally to ALL `.mdx` files imported anywhere (including layouts, components themselves) — too broad and risks recursion.
2. The former is local to "rendered post body" and explicit at the call site — matches the spec's "auto-injected so authors don't import per file" intent without surprising globals.
3. It mirrors how `MDXProvider` works in React's MDX flow, so the pattern is familiar to anyone joining the project.

The locked decision is: components live in `src/components/mdx/`, are re-exported as `mdxComponents` from `src/components/mdx/index.ts`, and are passed to `<Content components={mdxComponents} />` in both `src/pages/blog/[...slug].astro` and `src/pages/en/blog/[...slug].astro`. CLAUDE.md is updated (Task 9 Step 10) to document this so future contributors don't re-litigate.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-02-plan-3-retrieval-components.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. Particularly suited here because tasks 2–6 are component-shaped and ideal for parallel subagent dispatch (Task 4, 5, 6 are independent of each other once Task 2's `index.ts` pattern is established).

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints between phases.

**Which approach?**
