# Authority Graph Implementation Plan (EPIC D)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Spec:** `docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md` (EPIC D — `Authority pages` section, items D1–D5)
>
> **Depends on:** Plan 1 (`feat/llm-citable-foundation`), Plan 2 (entity pages), Plan 3 (retrieval components) merged to `main`.

**Goal:** Promote every tag in `frontmatter.tags` to a first-class topical surface — clickable chips, dedicated `/tags/<slug>` archives with `Blog` JSON-LD, a `/tags` index page, and a build-time guarantee that no post body contains a stray `# h1` competing with the layout title. Together these turn a flat post list into a navigable authority graph that LLMs can chunk and cite by topic.

**Architecture:** Two new static routes (`/tags`, `/tags/[tag]`) per locale, four page files total. They reuse `getOrderedPosts({locale})` and Plan 1's SEO helpers (`buildBlogNode`, `buildWebPageNode`, `graphIds`) — no new schema builders. A pure helper `src/lib/content/tags.ts` centralises slug→posts indexing and label resolution. Tag chips in `blog/index.astro` and `PostLayout.astro` switch from inert `<span>` to `<a>` with locale-aware hrefs. h1-validation reuses `unified + remark-parse + unist-util-visit` (already devDeps via Plan 1); existing posts' leading `# NN. Title` lines are stripped first. Sitemap completeness is asserted post-build by grepping `dist/client/sitemap-*.xml`; `@astrojs/sitemap` auto-discovers the new prerendered routes — no config diff.

**Tech Stack:** Astro 5, TypeScript 5.9 strict, Vitest 3, `unified` / `remark-parse` / `unist-util-visit` (already installed). No new dependencies.

---

## Working notes for agents

**Subagent assignments (per CLAUDE.md):** `backender` owns `src/lib/content/tags.ts`, `tests/unit/content/tags.test.ts`, `tests/unit/posts-h1.test.ts`, and the post-body strip. `frontender` owns `src/pages/tags/{,en/}index.astro`, `src/pages/tags/{,en/}[tag].astro`, and edits to `src/pages/{,en/}blog/index.astro` and `src/layouts/PostLayout.astro`. `architect` is only consulted if Task 3's cross-locale slug routing needs revisiting. `critic` reviews at end of Phase 3 and Phase 7.

**Discipline (per CLAUDE.md):** run `mcp__gitnexus__impact({target, direction: "upstream", repo: "astro-blog"})` before editing `PostLayout.astro` and `src/pages/blog/index.astro` (Task 4) and the post `*.md` files (Task 5). Run `mcp__gitnexus__detect_changes({scope: "staged", repo: "astro-blog"})` before every commit. Conventional commits (`feat`/`fix`/`test`/`docs`); no `--no-verify`. Functional style only.

**Commands:** `pnpm typecheck` (= `astro sync && astro check && tsc --noEmit`), `pnpm test`, `pnpm lint`, `pnpm build`, `pnpm dev` (port 4321).

**Worktree (recommended):**

```bash
git worktree add ../astro-blog-authority -b feat/authority-graph main && cd ../astro-blog-authority && pnpm install
```

**Vocabulary:** "RU slug" = bare collection id (e.g. `01-introduction`). "Tag slug" = the literal string in `frontmatter.tags[]` — language-neutral, identical across RU/EN twins by translation-pipeline contract (`pnpm translate` passes them through verbatim). Display labels resolve through `src/i18n/tags.{ru,en}.json`; missing entries surface as the raw slug (no build break, owner can fill in later).

**Owner-pending values:** none for this plan.

---

# Phase 0 — Setup

### Task 0: Verify clean state and impact-check load-bearing files

**Subagent:** `backender`

**Files:** none (read-only)

- [ ] **Step 1: Verify clean state, prerequisites, and baseline.**

```bash
git status
test -f src/lib/seo/schema.ts && \
  grep -q "buildBlogNode" src/lib/seo/nodes-global.ts && \
  grep -q "extraSchemaNodes" src/layouts/BaseLayout.astro && \
  echo "OK — prerequisites present" || echo "MISSING — Plan 1 must merge first"
pnpm typecheck && pnpm test && pnpm lint
```

Expected: working tree clean; `OK — prerequisites present`; all checks green. If `MISSING`, abort and rebase onto latest `main`.

- [ ] **Step 2: Run gitnexus impact analysis on the load-bearing files.**

```
mcp__gitnexus__impact({ target: "PostLayout", direction: "upstream", repo: "astro-blog" })
mcp__gitnexus__impact({ target: "blog/index", direction: "upstream", repo: "astro-blog" })
```

Expected: `PostLayout` is MEDIUM (consumed by `src/pages/blog/[...slug].astro` and EN sibling); `blog/index` is LOW. Note any surprise consumers in the PR description.

- [ ] **Step 3: Inventory current tag slugs.**

```bash
grep -hE '^  - ' src/content/posts/*.md src/content/posts/en/*.md | sort -u
```

Expected: list of unique tag entries (e.g. `- claude-code`, `- guide`). Confirm both `tags.ru.json` and `tags.en.json` cover them; record unlabeled slugs to mention in the PR.

---

# Phase 1 — Tag indexing helper (D1, D2 foundation)

### Task 1: `src/lib/content/tags.ts` — pure tag-index helper

**Subagent:** `backender`

**Files:**

- Create: `src/lib/content/tags.ts`
- Create: `tests/unit/content/tags.test.ts`

This module is the single source of truth for "which tag slugs exist, and which posts belong to each." It is fed `PostWithMeta[]` by callers — no I/O of its own — so it is trivially testable.

- [ ] **Step 1: Write the failing tests.**

Create `tests/unit/content/tags.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { groupPostsByTag, getAllTagSlugs, resolveTagLabel } from "~/lib/content/tags";
import type { PostWithMeta } from "~/lib/content/loader";

const fakePost = (id: string, tags: readonly string[], order = 1): PostWithMeta =>
  ({
    entry: {
      id,
      data: { title: id, description: id, pubDate: new Date("2026-04-23"), tags: [...tags], author: "Артём", draft: false },
      body: "",
    } as unknown as PostWithMeta["entry"],
    meta: {
      slug: id.replace(/^en\//, ""),
      order,
      pinned: false,
      hiddenFromList: false,
      searchVector: null,
      updatedAt: new Date(0),
    },
  });

describe("groupPostsByTag", () => {
  it("groups posts by tag and preserves caller order within each bucket", () => {
    const a = fakePost("01-foo", ["claude-code", "guide"]);
    const b = fakePost("02-bar", ["claude-code"]);
    const c = fakePost("03-baz", ["guide"]);
    const grouped = groupPostsByTag([a, b, c]);
    expect(grouped.get("claude-code")?.map((p) => p.entry.id)).toEqual(["01-foo", "02-bar"]);
    expect(grouped.get("guide")?.map((p) => p.entry.id)).toEqual(["01-foo", "03-baz"]);
  });

  it("returns an empty map when no posts have tags", () => {
    expect(groupPostsByTag([fakePost("01-x", [])]).size).toBe(0);
  });

  it("never mutates input post arrays", () => {
    const post = fakePost("01-foo", ["a", "b"]);
    const before = [...post.entry.data.tags];
    groupPostsByTag([post]);
    expect(post.entry.data.tags).toEqual(before);
  });
});

describe("getAllTagSlugs", () => {
  it("returns sorted unique slugs across both locales", () => {
    const ru = [fakePost("01-foo", ["b", "a"]), fakePost("02-bar", ["c"])];
    const en = [fakePost("en/01-foo", ["a", "d"])];
    expect(getAllTagSlugs({ ru, en })).toEqual(["a", "b", "c", "d"]);
    expect(getAllTagSlugs({ ru: [], en: [] })).toEqual([]);
  });
});

describe("resolveTagLabel", () => {
  it("returns the dict label when present, slug otherwise", () => {
    expect(resolveTagLabel("claude-code", "ru", { "claude-code": "Claude Code" })).toBe("Claude Code");
    expect(resolveTagLabel("unmapped", "en", {})).toBe("unmapped");
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

```bash
pnpm test tests/unit/content/tags.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement `src/lib/content/tags.ts`.**

```ts
import type { PostWithMeta } from "./loader";
import type { Locale } from "~/i18n";

/**
 * Indexes posts by tag slug, preserving the caller-supplied iteration order
 * inside each tag bucket. The caller is expected to pass `getOrderedPosts`
 * output, so this function never sorts: the bucket order matches blog index
 * order (pinned first, then `order` ascending).
 *
 * Pure: never mutates inputs; safe to run in component frontmatter / SSG.
 */
export const groupPostsByTag = (
  posts: ReadonlyArray<PostWithMeta>,
): ReadonlyMap<string, ReadonlyArray<PostWithMeta>> => {
  const out = new Map<string, PostWithMeta[]>();
  for (const post of posts) {
    for (const tag of post.entry.data.tags) {
      const bucket = out.get(tag);
      if (bucket) bucket.push(post);
      else out.set(tag, [post]);
    }
  }
  return out as ReadonlyMap<string, ReadonlyArray<PostWithMeta>>;
};

/**
 * Returns sorted unique tag slugs across BOTH locale collections. Used by the
 * /tags index page (D1) and by `getStaticPaths` for /tags/[tag] (D2). We
 * enumerate both locales because tag slugs are language-neutral identifiers —
 * a slug present only in one locale must still produce a route in the other
 * (the empty-list page explains this to the visitor).
 */
export const getAllTagSlugs = (input: {
  readonly ru: ReadonlyArray<PostWithMeta>;
  readonly en: ReadonlyArray<PostWithMeta>;
}): ReadonlyArray<string> => {
  const slugs = new Set<string>();
  for (const p of input.ru) for (const t of p.entry.data.tags) slugs.add(t);
  for (const p of input.en) for (const t of p.entry.data.tags) slugs.add(t);
  return [...slugs].sort();
};

/**
 * Resolves a tag slug to its human-readable label using the i18n dict. Falls
 * back to the slug itself when missing — this is intentional: it surfaces
 * "label needs to be added to tags.{ru,en}.json" without breaking links.
 *
 * `locale` is part of the signature even though it isn't used directly in the
 * lookup (the dict is locale-specific and supplied by the caller). It exists
 * so callers don't have to thread which dict they passed; future enhancements
 * (e.g. fallback chain ru→en) can use it without changing call sites.
 */
export const resolveTagLabel = (
  slug: string,
  _locale: Locale,
  dict: Readonly<Record<string, string>>,
): string => dict[slug] ?? slug;
```

- [ ] **Step 4: Verify and commit.**

```bash
pnpm test tests/unit/content/tags.test.ts && pnpm typecheck
git add src/lib/content/tags.ts tests/unit/content/tags.test.ts
git commit -m "feat(content): add tag indexing helper for archives and chips"
```

Expected: 8 assertions pass; 0 typecheck errors.

---

# Phase 2 — `/tags` index pages (D1)

### Task 2: `src/pages/tags/index.astro` (RU) and `src/pages/en/tags/index.astro` (EN)

**Subagent:** `frontender`

**Files:**

- Create: `src/pages/tags/index.astro`
- Create: `src/pages/en/tags/index.astro`
- Create: `tests/unit/content/tags-index-page.test.ts` (source-shape regression)

The index page lists every tag slug with a post count in the current locale and links to `/tags/<slug>` (RU) or `/en/tags/<slug>` (EN). It emits a `WebPage` schema node referencing `Person#me` via `about` (matches Plan 2's entity-page pattern).

- [ ] **Step 1: Add i18n strings for the page (RU + EN, mirror keys).**

Append to `src/i18n/strings.ru.json` (and mirror in `src/i18n/strings.en.json` with the EN values shown after the slash):

| Key | RU value | EN value |
|---|---|---|
| `tags.title` | `Темы` | `Topics` |
| `tags.description` | `Все теги, по которым каталогизированы статьи блога.` | `All tags that catalogue posts on this blog.` |
| `tags.eyebrow` | `Каталог` | `Index` |
| `tags.empty` | `Пока нет тегов.` | `No tags yet.` |
| `tags.postsCountAria` | `{count} статей по теме «{label}»` | `{count} posts tagged "{label}"` |
| `tags.archiveTitle` | `Тег: {label}` | `Tag: {label}` |
| `tags.archiveDescription` | `Все статьи блога с тегом «{label}».` | `All blog posts tagged "{label}".` |
| `tags.archiveEmptyRu` | `В русской версии блога пока нет статей с этим тегом.` | `No posts in the Russian edition use this tag yet.` |
| `tags.archiveEmptyEn` | `В английской версии блога пока нет статей с этим тегом.` | `No posts in the English edition use this tag yet.` |
| `tags.backToIndex` | `Все теги` | `All topics` |

`pnpm translate` hash-tracks these as new keys; both locales must be committed manually.

- [ ] **Step 2: Write the failing source-shape regression test.**

Create `tests/unit/content/tags-index-page.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ru = readFileSync(join(process.cwd(), "src/pages/tags/index.astro"), "utf8");
const en = readFileSync(join(process.cwd(), "src/pages/en/tags/index.astro"), "utf8");

describe.each([
  ["ru", ru, "/tags/", "tags.title"],
  ["en", en, "/en/tags/", "tags.title"],
])("tags index — %s", (_locale, source, hrefPrefix, _titleKey) => {
  it("imports getOrderedPosts and the tag helper", () => {
    expect(source).toMatch(/from\s+["']~\/lib\/content\/loader["']/);
    expect(source).toMatch(/getAllTagSlugs|groupPostsByTag/);
  });

  it("emits a WebPage schema node via extraSchemaNodes", () => {
    expect(source).toMatch(/buildWebPageNode/);
    expect(source).toMatch(/extraSchemaNodes=\{/);
  });

  it("uses the correct locale-prefixed href for tag links", () => {
    expect(source).toContain(hrefPrefix);
  });

  it("renders an aria-labelled list", () => {
    expect(source).toMatch(/aria-label/);
  });

  it("is prerendered (default for static routes)", () => {
    // Default-static; verify there is no `prerender = false` opt-out.
    expect(source).not.toMatch(/export\s+const\s+prerender\s*=\s*false/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails.**

```bash
pnpm test tests/unit/content/tags-index-page.test.ts
```

Expected: FAIL — files do not exist yet.

- [ ] **Step 4: Implement `src/pages/tags/index.astro`.**

```astro
---
import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { getOrderedPosts } from "~/lib/content/loader";
import { groupPostsByTag, getAllTagSlugs, resolveTagLabel } from "~/lib/content/tags";
import { getLocaleFromPath } from "~/lib/i18n/routing";
import { t } from "~/i18n";
import tagsRu from "~/i18n/tags.ru.json";
import { buildWebPageNode } from "~/lib/seo/schema";

const locale = getLocaleFromPath(Astro.url.pathname);
const ru = await getOrderedPosts({ locale: "ru" });
const en = await getOrderedPosts({ locale: "en" });
const slugs = getAllTagSlugs({ ru, en });
const grouped = groupPostsByTag(ru); // RU page counts RU posts only
const dict = tagsRu as Record<string, string>;

const canonical = new URL(Astro.url.pathname, Astro.site ?? Astro.url).toString();
const title = t(locale, "tags.title");
const description = t(locale, "tags.description");

const webPageNode = buildWebPageNode({
  locale,
  canonical,
  name: title,
  description,
});

const rows = slugs.map((slug) => ({
  slug,
  label: resolveTagLabel(slug, locale, dict),
  count: grouped.get(slug)?.length ?? 0,
}));
---

<BaseLayout
  title={title}
  description={description}
  fullWidth={true}
  extraSchemaNodes={[webPageNode]}
>
  <SiteSidebar slot="sidebar" />

  <section class="tags-index">
    <header class="tags-index__header">
      <p class="tags-index__eyebrow">{t(locale, "tags.eyebrow")}</p>
      <h1 class="tags-index__title">{title}</h1>
      <p class="tags-index__lede">{description}</p>
    </header>

    {
      rows.length === 0 ? (
        <p class="tags-index__empty">{t(locale, "tags.empty")}</p>
      ) : (
        <ul class="tags-index__list" aria-label={title}>
          {rows.map((row) => (
            <li class="tags-index__item">
              <a class="tags-index__link" href={`/tags/${row.slug}`}>
                <span class="tags-index__chip">#{row.label}</span>
                <span
                  class="tags-index__count"
                  aria-label={t(locale, "tags.postsCountAria")
                    .replace("{count}", String(row.count))
                    .replace("{label}", row.label)}
                >
                  {row.count}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )
    }
  </section>

  <style>
    /* `.tags-index__header` mirrors `.list__header` in blog/index.astro
       (border-bottom, eyebrow + serif title + muted lede). `.tags-index__list`
       is a flex-wrap pill row using the same chip border/radius/transition as
       `.list__tag-chip` (see existing block in blog/index.astro). All values
       use design tokens from src/styles/tokens.css; no new tokens needed. */
    .tags-index { max-width: 720px; }
    .tags-index__header { margin-bottom: var(--space-6); padding-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); }
    .tags-index__eyebrow { font-family: var(--font-mono); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-fg-subtle); margin: 0 0 var(--space-2) 0; }
    .tags-index__title { font-family: var(--font-serif); font-size: var(--fs-3xl); font-weight: 500; margin: 0 0 var(--space-2) 0; color: var(--color-fg); letter-spacing: var(--tracking-tight); }
    .tags-index__lede { margin: 0; color: var(--color-fg-muted); line-height: var(--lh-normal); }
    .tags-index__list { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .tags-index__link { display: inline-flex; align-items: baseline; gap: var(--space-2); padding: var(--space-1) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-pill); color: var(--color-fg); text-decoration: none; transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out); }
    .tags-index__link:hover { border-color: var(--color-accent); color: var(--color-accent-hover); }
    .tags-index__chip { font-family: var(--font-mono); font-size: var(--fs-sm); }
    .tags-index__count { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--color-fg-subtle); font-variant-numeric: tabular-nums; }
    .tags-index__empty { color: var(--color-fg-muted); font-style: italic; }
  </style>
</BaseLayout>
```

- [ ] **Step 5: Implement the EN sibling `src/pages/en/tags/index.astro`.**

Copy the RU file verbatim, then apply these three edits:

1. Replace the dict import line with `import tagsEn from "~/i18n/tags.en.json";` and the `dict` const with `const dict = tagsEn as Record<string, string>;`.
2. Replace `groupPostsByTag(ru)` with `groupPostsByTag(en)` (EN archive counts EN posts only).
3. Replace the chip href ``href={`/tags/${row.slug}`}`` with ``href={`/en/tags/${row.slug}`}``.

Everything else — frontmatter imports order, layout markup, `<style>` block — is byte-identical to the RU sibling.

- [ ] **Step 6: Verify, smoke-check, and commit.**

```bash
pnpm test tests/unit/content/tags-index-page.test.ts && pnpm typecheck
pnpm dev   # in another shell, visit /tags and /en/tags
```

Expected: tests PASS; 0 typecheck errors; rendered pages list every tag slug with a count, the JSON-LD `<script>` includes a `WebPage` node with `"about": {"@id": "https://artka.dev/#person"}`. Clicking a chip 404s (handled by Task 3). Stop dev server.

```bash
git add src/i18n/strings.ru.json src/i18n/strings.en.json \
        src/pages/tags/index.astro src/pages/en/tags/index.astro \
        tests/unit/content/tags-index-page.test.ts
git commit -m "feat(authority): add /tags index pages with WebPage schema"
```

---

# Phase 3 — `/tags/[tag]` archive pages (D2)

### Task 3: `src/pages/tags/[tag].astro` (RU) and `src/pages/en/tags/[tag].astro` (EN)

**Subagent:** `frontender`

**Files:**

- Create: `src/pages/tags/[tag].astro`
- Create: `src/pages/en/tags/[tag].astro`
- Create: `tests/unit/content/tags-archive-page.test.ts`

Each archive page lists posts matching the current locale, with a `Blog` JSON-LD node listing those posts via `blogPost: [{@type: "BlogPosting", "@id": ...}]`. Pagination is intentionally not added — the spec notes ≤ 30 posts per tag at current scale.

**Key i18n decision (recorded here per the risk callout):** `getStaticPaths()` enumerates the **union** of slugs across both locales. A slug present only in (say) RU posts still produces an `/en/tags/<slug>` route — that page renders with an empty list and a localized "no posts in this language yet" hint, plus a back-link to the index. This keeps URLs stable across translations and avoids 404 churn when a slug appears in one locale before the other ships its translation.

- [ ] **Step 1: Write the failing source-shape regression test.**

Create `tests/unit/content/tags-archive-page.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ru = readFileSync(join(process.cwd(), "src/pages/tags/[tag].astro"), "utf8");
const en = readFileSync(join(process.cwd(), "src/pages/en/tags/[tag].astro"), "utf8");

describe.each([
  ["ru", ru, "ru"],
  ["en", en, "en"],
])("tags archive — %s", (_label, source, locale) => {
  it("declares getStaticPaths", () => {
    expect(source).toMatch(/export\s+(?:async\s+)?function\s+getStaticPaths/);
  });

  it("enumerates slugs from BOTH locales (union, not just current)", () => {
    expect(source).toMatch(/getAllTagSlugs/);
    expect(source).toMatch(/locale:\s*"ru"/);
    expect(source).toMatch(/locale:\s*"en"/);
  });

  it("emits a Blog node with blogPost listing", () => {
    expect(source).toMatch(/"@type":\s*"Blog"/);
    expect(source).toMatch(/blogPost:/);
  });

  it("uses BreadcrumbList linking back to /tags index", () => {
    expect(source).toMatch(/"@type":\s*"BreadcrumbList"/);
  });

  it(`includes a localized empty-state for slugs missing in ${locale}`, () => {
    const expectedKey =
      locale === "ru" ? /tags\.archiveEmptyRu/ : /tags\.archiveEmptyEn/;
    expect(source).toMatch(expectedKey);
  });
});
```

- [ ] **Step 2: Run test to verify it fails.**

```bash
pnpm test tests/unit/content/tags-archive-page.test.ts
```

Expected: FAIL — files do not exist.

- [ ] **Step 3: Implement `src/pages/tags/[tag].astro`.**

```astro
---
import BaseLayout from "~/layouts/BaseLayout.astro";
import SiteSidebar from "~/components/SiteSidebar.astro";
import { getOrderedPosts, type PostWithMeta } from "~/lib/content/loader";
import { groupPostsByTag, getAllTagSlugs, resolveTagLabel } from "~/lib/content/tags";
import { t } from "~/i18n";
import tagsRu from "~/i18n/tags.ru.json";
import { graphIds } from "~/lib/seo/schema";
import type { GetStaticPaths } from "astro";

export const getStaticPaths = (async () => {
  const ru = await getOrderedPosts({ locale: "ru" });
  const en = await getOrderedPosts({ locale: "en" });
  return getAllTagSlugs({ ru, en }).map((tag) => ({ params: { tag } }));
}) satisfies GetStaticPaths;

const { tag } = Astro.params;
if (typeof tag !== "string") throw new Error("Tag param missing");

const ruPosts = await getOrderedPosts({ locale: "ru" });
const grouped = groupPostsByTag(ruPosts);
const matches: ReadonlyArray<PostWithMeta> = grouped.get(tag) ?? [];

const dict = tagsRu as Record<string, string>;
const label = resolveTagLabel(tag, "ru", dict);
const title = t("ru", "tags.archiveTitle").replace("{label}", label);
const description = t("ru", "tags.archiveDescription").replace("{label}", label);
const canonical = new URL(Astro.url.pathname, Astro.site ?? Astro.url).toString();

const SITE = "https://artka.dev";
const bareSlug = (id: string): string => id.replace(/^en\//, "");

// Blog node for THIS archive — distinct @id per slug; references global Person/Org.
const blogNode = {
  "@type": "Blog",
  "@id": `${canonical}#blog`,
  url: canonical,
  name: title,
  description,
  inLanguage: "ru-RU",
  author: { "@id": graphIds.person },
  publisher: { "@id": graphIds.organization },
  blogPost: matches.map((p) => ({
    "@type": "BlogPosting",
    "@id": `${SITE}/blog/${bareSlug(p.entry.id)}#blogposting`,
    headline: p.entry.data.title,
    url: `${SITE}/blog/${bareSlug(p.entry.id)}`,
    datePublished: p.entry.data.pubDate.toISOString(),
  })),
};

const breadcrumbNode = {
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Главная", item: `${SITE}/` },
    { "@type": "ListItem", position: 2, name: t("ru", "tags.title"), item: `${SITE}/tags` },
    { "@type": "ListItem", position: 3, name: label },
  ],
};
---

<BaseLayout
  title={title}
  description={description}
  fullWidth={true}
  extraSchemaNodes={[blogNode, breadcrumbNode]}
>
  <SiteSidebar slot="sidebar" />

  <section class="tag-archive">
    <header class="tag-archive__header">
      <p class="tag-archive__eyebrow">
        <a href="/tags">{t("ru", "tags.backToIndex")}</a>
      </p>
      <h1 class="tag-archive__title">#{label}</h1>
      <p class="tag-archive__lede">{description}</p>
    </header>

    {
      matches.length === 0 ? (
        <p class="tag-archive__empty">{t("ru", "tags.archiveEmptyRu")}</p>
      ) : (
        <ul class="tag-archive__posts">
          {matches.map((p) => (
            <li class="tag-archive__item">
              <a href={`/blog/${bareSlug(p.entry.id)}`} class="tag-archive__link">
                <span class="tag-archive__num">{String(p.meta.order).padStart(2, "0")}</span>
                <span class="tag-archive__body">
                  <h2 class="tag-archive__post-title">{p.entry.data.title}</h2>
                  <p class="tag-archive__post-desc">{p.entry.data.description}</p>
                  <time
                    datetime={p.entry.data.pubDate.toISOString()}
                    class="tag-archive__post-date"
                  >
                    {p.entry.data.pubDate.toLocaleDateString("ru-RU", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </time>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )
    }
  </section>

  <style>
    /* Structural clone of blog/index.astro's `.list__*` (same 42px+1fr grid,
       same serif post titles, same hover-translate). Class prefix `.tag-archive`
       avoids collision with the home blog listing. Uses design tokens; no new
       tokens needed. Match blog/index.astro for any future divergence. */
    .tag-archive { max-width: 720px; }
    .tag-archive__header { margin-bottom: var(--space-6); padding-bottom: var(--space-4); border-bottom: 1px solid var(--color-border); }
    .tag-archive__eyebrow { font-family: var(--font-mono); font-size: var(--fs-xs); text-transform: uppercase; letter-spacing: var(--tracking-wide); color: var(--color-fg-subtle); margin: 0 0 var(--space-2) 0; }
    .tag-archive__eyebrow a { color: inherit; text-decoration: none; }
    .tag-archive__eyebrow a:hover { color: var(--color-accent-hover); }
    .tag-archive__title { font-family: var(--font-serif); font-size: var(--fs-3xl); font-weight: 500; margin: 0 0 var(--space-2) 0; color: var(--color-fg); letter-spacing: var(--tracking-tight); }
    .tag-archive__lede { margin: 0; color: var(--color-fg-muted); line-height: var(--lh-normal); }
    .tag-archive__posts { list-style: none; padding: 0; margin: 0; }
    .tag-archive__item + .tag-archive__item { border-top: 1px solid var(--color-border); }
    .tag-archive__link { display: grid; grid-template-columns: 42px 1fr; gap: var(--space-4); padding: var(--space-5) 0; color: inherit; text-decoration: none; transition: transform var(--dur-fast) var(--ease-out); }
    .tag-archive__link:hover { transform: translateX(2px); }
    .tag-archive__num { font-family: var(--font-mono); font-size: var(--fs-lg); color: var(--color-fg-subtle); font-variant-numeric: tabular-nums; padding-top: 2px; }
    .tag-archive__post-title { font-family: var(--font-serif); font-size: var(--fs-xl); line-height: var(--lh-snug); letter-spacing: var(--tracking-tight); font-weight: 500; margin: 0 0 var(--space-2) 0; color: var(--color-fg); }
    .tag-archive__link:hover .tag-archive__post-title { color: var(--color-accent-hover); }
    .tag-archive__post-desc { margin: 0 0 var(--space-2) 0; color: var(--color-fg-muted); line-height: var(--lh-normal); }
    .tag-archive__post-date { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--color-fg-subtle); text-transform: uppercase; letter-spacing: var(--tracking-wide); }
    .tag-archive__empty { color: var(--color-fg-muted); font-style: italic; }
  </style>
</BaseLayout>
```

- [ ] **Step 4: Implement the EN sibling `src/pages/en/tags/[tag].astro`.**

Copy the RU file verbatim, then apply these substitutions:

1. Imports: `tagsRu` → `tagsEn` (path `~/i18n/tags.en.json`).
2. Frontmatter: `getOrderedPosts({ locale: "ru" })` → `getOrderedPosts({ locale: "en" })`. Rename the local `ruPosts` → `enPosts`. The `dict` becomes `tagsEn as Record<string, string>`.
3. Translation strings: replace every `t("ru", ...)` with `t("en", ...)` and `resolveTagLabel(tag, "ru", dict)` with `resolveTagLabel(tag, "en", dict)`.
4. JSON-LD `Blog` node: `inLanguage: "ru-RU"` → `"en-US"`; `blogPost[].@id` and `blogPost[].url` use ``${SITE}/en/blog/${bareSlug(p.entry.id)}``.
5. Breadcrumb node: first item `name: "Главная"` → `"Home"`, `item: ${SITE}/` → `${SITE}/en/`; second item `${SITE}/tags` → `${SITE}/en/tags`.
6. Markup: back-link `href="/tags"` → `href="/en/tags"`; post link `href={\`/blog/${bareSlug(p.entry.id)}\`}` → `href={\`/en/blog/${bareSlug(p.entry.id)}\`}`; empty-state copy `t("ru", "tags.archiveEmptyRu")` → `t("en", "tags.archiveEmptyEn")`; date locale `"ru-RU"` → `"en-US"`.

The `<style>` block is byte-identical to the RU sibling. Layout markup classes (`.tag-archive*`) are unchanged.

- [ ] **Step 5: Verify, smoke-check, and commit.**

```bash
pnpm test tests/unit/content/tags-archive-page.test.ts && pnpm typecheck
pnpm dev   # in another shell:
# curl -s http://localhost:4321/tags/claude-code | python3 -c "import sys,re,json;\
#   m=re.search(r'<script[^>]+ld\\+json[^>]*>(.+?)</script>',sys.stdin.read(),re.S);\
#   blog=next(n for n in json.loads(m.group(1))['@graph'] if n['@type']=='Blog');\
#   print(blog['@id'], len(blog['blogPost']))"
```

Expected: tests PASS; 0 typecheck errors; rendered `/tags/claude-code` includes a `Blog` node with non-zero `blogPost` count and an `@id` ending `#blog`. `/en/tags/<unique-ru-only-slug>` (if any) shows the localized empty-state. Stop dev server.

```bash
git add src/pages/tags/[tag].astro src/pages/en/tags/[tag].astro \
        tests/unit/content/tags-archive-page.test.ts
git commit -m "feat(authority): add /tags/[tag] archives with Blog schema"
```

---

# Phase 4 — Clickable tag chips (D3)

### Task 4: Convert tag chips in `blog/index.astro` and `PostLayout.astro` to anchors

**Subagent:** `frontender`

**Files:**

- Modify: `src/pages/blog/index.astro` (lines ~32-38)
- Modify: `src/layouts/PostLayout.astro` (lines ~145-153)
- Create: `tests/unit/content/tag-chip-links.test.ts`

Both renderers currently show `<span>#tag</span>` with no link. We swap them for `<a>` and resolve display labels through the locale-specific dict (consistent with Tasks 2 and 3).

- [ ] **Step 1: Run impact analysis.**

```
mcp__gitnexus__impact({ target: "PostLayout", direction: "upstream", repo: "astro-blog" })
mcp__gitnexus__impact({ target: "blog/index", direction: "upstream", repo: "astro-blog" })
```

Expected: same as Task 0 step 3. Confirm no surprise consumers.

- [ ] **Step 2: Write the failing source-shape regression test.**

Create `tests/unit/content/tag-chip-links.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const blogIndex = readFileSync(join(process.cwd(), "src/pages/blog/index.astro"), "utf8");
const blogIndexEn = readFileSync(
  join(process.cwd(), "src/pages/en/blog/index.astro"),
  "utf8",
);
const postLayout = readFileSync(join(process.cwd(), "src/layouts/PostLayout.astro"), "utf8");

describe("tag chips are anchors", () => {
  it("blog/index.astro renders tag chips as <a> with /tags/<slug>", () => {
    expect(blogIndex).toMatch(/<a[^>]*class="list__tag-chip"/);
    expect(blogIndex).toMatch(/href=\{`\/tags\/\$\{[^}]+\}`\}/);
    expect(blogIndex).not.toMatch(/<span class="list__tag-chip">/);
  });

  it("en/blog/index.astro renders tag chips as <a> with /en/tags/<slug>", () => {
    expect(blogIndexEn).toMatch(/<a[^>]*class="list__tag-chip"/);
    expect(blogIndexEn).toMatch(/href=\{`\/en\/tags\/\$\{[^}]+\}`\}/);
  });

  it("PostLayout.astro renders tag chips as <a> with locale-aware path", () => {
    expect(postLayout).toMatch(/<a[^>]*class="post__tag-chip"/);
    expect(postLayout).toMatch(/locale === "en" \? "\/en\/tags\/" : "\/tags\/"/);
    expect(postLayout).not.toMatch(/<span class="post__tag-chip">/);
  });

  it("PostLayout resolves display labels through tags.{ru,en}.json", () => {
    expect(postLayout).toMatch(/tags\.(ru|en)\.json/);
    expect(postLayout).toMatch(/resolveTagLabel/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails.**

```bash
pnpm test tests/unit/content/tag-chip-links.test.ts
```

Expected: FAIL — current chips are `<span>` elements.

- [ ] **Step 4: Modify `src/pages/blog/index.astro`.**

Add to the existing frontmatter (preserving Plan 1's `buildBlogNode` import / `blogNode` const / `extraSchemaNodes={[blogNode]}`):

```astro
import { resolveTagLabel } from "~/lib/content/tags";
import tagsRu from "~/i18n/tags.ru.json";

const tagsHrefBase = locale === "en" ? "/en/tags" : "/tags";
const dict = tagsRu as Record<string, string>;
```

Replace the existing chips block (the `{ allTags.length > 0 && (...) }` region) with:

```astro
    {
      allTags.length > 0 && (
        <div class="list__tags" aria-label={t(locale, "blog.tagsAria")}>
          {allTags.map((tag: string) => (
            <a class="list__tag-chip" href={`${tagsHrefBase}/${tag}`}>
              #{resolveTagLabel(tag, locale, dict)}
            </a>
          ))}
        </div>
      )
    }
```

In the `<style>` block, append `text-decoration: none;` and a hover transition to `.list__tag-chip` so the anchor doesn't underline:

```css
.list__tag-chip {
  /* existing rules unchanged */
  text-decoration: none;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    color var(--dur-fast) var(--ease-out);
}
.list__tag-chip:hover {
  border-color: var(--color-accent);
  color: var(--color-accent-hover);
}
```

- [ ] **Step 5: Apply the same edits to `src/pages/en/blog/index.astro`.**

Substitutions:

- Import `tagsEn from "~/i18n/tags.en.json"` (instead of `tagsRu`).
- `const dict = tagsEn as Record<string, string>;`
- `tagsHrefBase` simplifies to `"/en/tags"` directly (since the page is always EN), but the locale-conditional form is fine too — keep the structure parallel for symmetry.

- [ ] **Step 6: Modify `src/layouts/PostLayout.astro`.**

Add to the imports near the top of the frontmatter (after the existing `t` import):

```astro
import { resolveTagLabel } from "~/lib/content/tags";
import tagsRu from "~/i18n/tags.ru.json";
import tagsEn from "~/i18n/tags.en.json";
```

Add a frontmatter constant near the other locale-derived values (e.g. just after the `locale` declaration):

```astro
const tagDict = (locale === "en" ? tagsEn : tagsRu) as Record<string, string>;
const tagsHrefBase = locale === "en" ? "/en/tags/" : "/tags/";
```

Replace the existing tag chips block in the post header (lines ~144-154) with:

```astro
      {
        tags.length > 0 && (
          <ul class="post__tags" aria-label={t(locale, "post.tags")}>
            {tags.map((tag: string) => (
              <li>
                <a class="post__tag-chip" href={`${tagsHrefBase}${tag}`}>
                  #{resolveTagLabel(tag, locale, tagDict)}
                </a>
              </li>
            ))}
          </ul>
        )
      }
```

In the `<style>` block, add `display: inline-block; text-decoration: none;` plus a transition to `.post__tag-chip` and a `:hover` selector mirroring `.list__tag-chip` above (same property values).

- [ ] **Step 7: Verify and commit.**

```bash
pnpm test tests/unit/content/tag-chip-links.test.ts
pnpm typecheck
pnpm dev   # in another shell, curl /blog/01-introduction and confirm chips render as <a>
```

Expected: tests PASS (4 assertions); 0 typecheck errors; rendered HTML contains `<a class="post__tag-chip" href="/tags/...">`. Stop dev server.

```
mcp__gitnexus__detect_changes({ scope: "staged", repo: "astro-blog" })
```

Expected staged set: `src/pages/blog/index.astro`, `src/pages/en/blog/index.astro`, `src/layouts/PostLayout.astro`, `tests/unit/content/tag-chip-links.test.ts`.

```bash
git add src/pages/blog/index.astro src/pages/en/blog/index.astro \
        src/layouts/PostLayout.astro \
        tests/unit/content/tag-chip-links.test.ts
git commit -m "feat(authority): make tag chips clickable, link to /tags/<slug>"
```

---

# Phase 5 — h1-discipline (D4)

### Task 5: Strip leading `# Title` from existing posts

**Subagent:** `backender`

**Files:**

- Modify: every file in `src/content/posts/*.md` and `src/content/posts/en/*.md` that has `# ` at the top of body (before the test in Task 6 turns red).

**Why first:** Per the spec, the layout already renders `frontmatter.title` as `<h1>`. A second `<h1>` in the body breaks single-h1 discipline and confuses passage extractors. Existing posts (15 RU + 14 EN, including `claude.md`) all duplicate the title as their first body heading — they must be cleaned up before the validation test in Task 6 can be turned on.

**Distinguishing real top-level h1 from bash-comment lines in fenced code blocks:** the cleanup edits a single line (the leading `# NN. Title` line, plus the blank line that follows it where present). Bash-comment lines like `# В CLI` inside `` ```bash ... ``` `` blocks are out of scope — they are NOT h1 nodes per markdown grammar (remark-parse parses them as `code` nodes' raw text). Task 6's test uses `unified + remark-parse` which respects this; we never need to touch those bash comments.

- [ ] **Step 1: Strip the leading `# ...` heading from each offender via an ad-hoc script.**

The leading h1 is invariably the first non-frontmatter content (`# 01. Title…`). Bash-comment lines inside fenced code blocks are NOT h1 nodes per markdown grammar — `remark-parse` treats them as text inside a `code` node — so a regex that targets only the line directly after the closing `---` is safe.

Create `scripts/strip-leading-h1.ts` (ad-hoc — **do not commit**):

```ts
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const dirs = ["src/content/posts", "src/content/posts/en"];
for (const dir of dirs) {
  for (const f of await readdir(dir)) {
    if (!f.endsWith(".md") && !f.endsWith(".mdx")) continue;
    const file = join(dir, f);
    const raw = await readFile(file, "utf8");
    const m = raw.match(/^(---\n[\s\S]*?\n---\n)([\s\S]*)$/);
    if (!m) continue;
    const [, frontmatter, body] = m;
    const lines = body.split("\n");
    let i = 0;
    while (i < lines.length && lines[i].trim() === "") i++;
    if (i < lines.length && /^# [^#]/.test(lines[i] ?? "")) {
      lines.splice(i, lines[i + 1]?.trim() === "" ? 2 : 1);
      await writeFile(file, frontmatter + lines.join("\n"));
      console.log("stripped:", file);
    }
  }
}
```

Run, then discard:

```bash
pnpm dlx tsx scripts/strip-leading-h1.ts
rm scripts/strip-leading-h1.ts
```

Expected: ~16 lines of `stripped:` output (15 RU + 14 EN translations + `claude.md`).

- [ ] **Step 2: Confirm the strip looks correct.**

```bash
git diff --stat src/content/posts/
head -16 src/content/posts/01-introduction.md
```

Expected: ~30 files touched, each `-2 lines`. The post starts with the blockquote `> Перед тем как разбирать ...`, NOT a `# 01. ...` line.

- [ ] **Step 3: Run all existing tests to confirm nothing broke.**

```bash
pnpm test && pnpm typecheck
```

Expected: all green. The translation pipeline's hash-based drift detector (`pnpm translate:check`) compares frontmatter `sourceHash`; because we edit only the body and edit RU + EN symmetrically, hashes are unaffected. If `pnpm translate:check` flags drift, run `pnpm translate` once to refresh, then re-stage.

- [ ] **Step 4: Detect changes scope and commit.**

```
mcp__gitnexus__detect_changes({ scope: "staged", repo: "astro-blog" })
```

Expected: only `src/content/posts/**/*.md` is staged.

```bash
git add src/content/posts/
git commit -m "fix(content): strip duplicate leading h1 from post bodies"
```

---

### Task 6: Add `tests/unit/posts-h1.test.ts` to enforce the rule going forward

**Subagent:** `backender`

**Files:**

- Create: `tests/unit/posts-h1.test.ts`

The test parses each post's markdown body via `unified + remark-parse` (NOT regex on raw text — that would false-positive on bash `# comment` lines inside fenced code blocks). It walks the mdast and fails on any `heading` node with `depth === 1`.

- [ ] **Step 1: Write the failing-but-currently-passing test.**

Create `tests/unit/posts-h1.test.ts`:

```ts
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import type { Root } from "mdast";

const POST_DIRS = ["src/content/posts", "src/content/posts/en"];

interface PostFile {
  readonly path: string;
  readonly body: string;
}

const stripFrontmatter = (raw: string): string =>
  raw.replace(/^---\n[\s\S]*?\n---\s*\n?/, "");

const collectPosts = async (): Promise<ReadonlyArray<PostFile>> => {
  const out: PostFile[] = [];
  for (const dir of POST_DIRS) {
    let entries: string[] = [];
    try {
      entries = await readdir(dir);
    } catch {
      continue; // dir may not exist in some test contexts
    }
    for (const f of entries) {
      if (!f.endsWith(".md") && !f.endsWith(".mdx")) continue;
      const path = join(dir, f);
      const raw = await readFile(path, "utf8");
      out.push({ path, body: stripFrontmatter(raw) });
    }
  }
  return out;
};

describe("post bodies must not contain a top-level h1", () => {
  it("scans every *.md/*.mdx under src/content/posts and reports offenders", async () => {
    const posts = await collectPosts();
    expect(posts.length).toBeGreaterThan(0); // sanity — guard against dir typo

    const offenders: string[] = [];
    for (const post of posts) {
      const tree = unified().use(remarkParse).parse(post.body) as Root;
      visit(tree, "heading", (node) => {
        if (node.depth === 1) {
          offenders.push(post.path);
        }
      });
    }

    if (offenders.length > 0) {
      const msg = [
        "These post bodies contain a top-level h1 (`# Heading`). The post layout",
        "already renders frontmatter.title as <h1>; remove or downgrade these to ##.",
        "",
        ...new Set(offenders).values(),
      ].join("\n");
      throw new Error(msg);
    }
  });
});
```

- [ ] **Step 2: Run the test.**

```bash
pnpm test tests/unit/posts-h1.test.ts
```

Expected: PASS — Task 5 already cleaned all offenders. If this fails, the Task 5 strip script missed a file (or a code block was misclassified). Inspect the failure message which lists offending paths, fix manually, and re-run.

- [ ] **Step 3: Belt-and-braces — verify the test fails on a regression, then revert.**

```bash
{ printf '# Test\n\n'; cat src/content/posts/01-introduction.md; } > /tmp/x.md && \
  mv /tmp/x.md src/content/posts/01-introduction.md && \
  pnpm test tests/unit/posts-h1.test.ts ; \
  git checkout -- src/content/posts/01-introduction.md && \
  pnpm test tests/unit/posts-h1.test.ts
```

Expected: first invocation FAILs listing `01-introduction.md`; after revert, second invocation PASSes.

- [ ] **Step 4: Typecheck and commit.**

```bash
pnpm typecheck
git add tests/unit/posts-h1.test.ts
git commit -m "test(content): fail when a post body declares a top-level h1"
```

---

# Phase 6 — Sitemap completeness (D5)

### Task 7: Verify sitemap covers tag pages and entity pages

**Subagent:** `backender`

**Files:**

- Create: `tests/unit/seo/sitemap-coverage.test.ts`

The `@astrojs/sitemap` integration auto-discovers all prerendered routes (its `filter` only excludes `/admin/`, `/login/`, `/api/`). Tag pages are static (no `prerender = false`), so they will be picked up automatically. We add a post-build assertion that every expected URL appears in `dist/client/sitemap-*.xml`.

This test uses `vi.beforeAll` to require a build artifact. To avoid forcing every Vitest run to do a full build, we make it skip gracefully when `dist/client/sitemap-index.xml` is missing — and document that the CI pipeline already runs `pnpm build` before `pnpm test` in the deploy workflow. Local devs run `pnpm build && pnpm test tests/unit/seo/sitemap-coverage.test.ts` to validate.

- [ ] **Step 1: Confirm the sitemap config does NOT need changes.**

```bash
grep -n "filter:" astro.config.ts
```

Expected: the existing filter only excludes `/admin/`, `/login/`, `/api/`. `/tags`, `/tags/<slug>`, `/about`, `/now`, `/uses`, `/projects` and their `/en/...` variants are not excluded — they will appear in the sitemap automatically.

- [ ] **Step 2: Write the failing-or-skipped test.**

Create `tests/unit/seo/sitemap-coverage.test.ts`:

```ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DIST = join(process.cwd(), "dist", "client");

const loadSitemapUrls = (): ReadonlySet<string> | null => {
  if (!existsSync(DIST)) return null;
  const sitemapFiles = readdirSync(DIST).filter(
    (f) => f.startsWith("sitemap-") && f.endsWith(".xml"),
  );
  if (sitemapFiles.length === 0) return null;
  const urls = new Set<string>();
  for (const f of sitemapFiles) {
    const xml = readFileSync(join(DIST, f), "utf8");
    for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
      urls.add(m[1]);
    }
  }
  return urls;
};

describe("sitemap coverage", () => {
  const urls = loadSitemapUrls();
  const skipReason = urls
    ? null
    : "dist/client/sitemap-*.xml not found — run `pnpm build` first";

  it.skipIf(skipReason !== null)(
    "includes both /tags and /en/tags index pages",
    () => {
      expect(urls!).toContain("https://artka.dev/tags");
      expect(urls!).toContain("https://artka.dev/en/tags");
    },
  );

  it.skipIf(skipReason !== null)(
    "includes at least one /tags/<slug> archive in each locale",
    () => {
      const ruArchives = [...urls!].filter((u) =>
        u.match(/^https:\/\/artka\.dev\/tags\/[^/]+$/),
      );
      const enArchives = [...urls!].filter((u) =>
        u.match(/^https:\/\/artka\.dev\/en\/tags\/[^/]+$/),
      );
      expect(ruArchives.length).toBeGreaterThan(0);
      expect(enArchives.length).toBeGreaterThan(0);
    },
  );

  it.skipIf(skipReason !== null)("includes the entity pages from Plan 2", () => {
    for (const path of ["/about", "/now", "/uses", "/projects"]) {
      expect(urls!).toContain(`https://artka.dev${path}`);
      expect(urls!).toContain(`https://artka.dev/en${path}`);
    }
  });

  it.skipIf(skipReason !== null)("excludes /admin, /login, /api", () => {
    for (const u of urls!) {
      expect(u).not.toMatch(/\/admin\//);
      expect(u).not.toMatch(/\/login\b/);
      expect(u).not.toMatch(/\/api\//);
    }
  });
});
```

- [ ] **Step 3: Build and run the test.**

```bash
pnpm build && pnpm test tests/unit/seo/sitemap-coverage.test.ts
```

Expected: PASS — all 4 assertions green.

If the "entity pages" assertion fails because a particular Plan 2 page hasn't shipped (e.g. `/projects` postponed), comment that one assertion with a TODO referencing Plan 2 and re-run.

- [ ] **Step 4: Commit.**

```bash
git add tests/unit/seo/sitemap-coverage.test.ts
git commit -m "test(seo): assert sitemap covers tag pages and entity pages"
```

---

# Phase 7 — Final verification

### Task 8: End-to-end sanity build, sitemap visual check, CLAUDE.md note

**Subagent:** `critic` reviews; `backender` implements.

**Files:**

- Modify: `CLAUDE.md` (one-line note about the new helper module — only if a corresponding pointer block exists; otherwise skip without stalling).

- [ ] **Step 1: Full build and preview smoke check.**

```bash
pnpm build && pnpm preview
```

Expected: 0 build errors. In another shell, hit `/tags`, `/en/tags`, `/tags/claude-code`, `/en/tags/claude-code`, `/blog`, and `/blog/01-introduction` and confirm: chips are anchors; `/blog/01-introduction` has exactly one `<h1>` (the layout title, no duplicate body h1). Stop preview.

- [ ] **Step 2: Static-output assertions.**

```bash
# Single h1 per post page
for f in dist/client/blog/*/index.html; do
  c=$(grep -oE '<h1[ >]' "$f" | wc -l | tr -d ' ')
  [ "$c" = "1" ] || echo "BAD: $f has $c h1"
done

# Exactly one JSON-LD block per representative page
for f in dist/client/tags/claude-code/index.html dist/client/blog/index.html dist/client/tags/index.html; do
  echo "$f: $(grep -oc 'application/ld+json' "$f")"
done

# Tag archive @graph contains Blog node with non-empty blogPost
node -e "const fs=require('node:fs');const h=fs.readFileSync('dist/client/tags/claude-code/index.html','utf8');const m=h.match(/<script[^>]+ld\\+json[^>]*>([\\s\\S]+?)<\\/script>/);const g=JSON.parse(m[1].replace(/\\\\u003c/g,'<').replace(/\\\\u003e/g,'>').replace(/\\\\u0026/g,'&'));const b=g['@graph'].find(n=>n['@type']==='Blog');console.log({types:g['@graph'].map(n=>n['@type']),blogId:b['@id'],postCount:b.blogPost.length});"
```

Expected: no `BAD:` lines; each JSON-LD count is `1`; the node printout includes `Blog`, `BreadcrumbList`, `Person`, `Organization`, `WebSite`, with `blogId: https://artka.dev/tags/claude-code#blog` and `postCount >= 2`.

- [ ] **Step 3: Re-run full quality gates.**

```bash
pnpm test && pnpm lint && pnpm typecheck
```

Expected: all green.

- [ ] **Step 4: Optionally update `CLAUDE.md`.**

If `CLAUDE.md` has an "Импорты (доп. контекст)" section with `@docs/...` pointers (added by Plan 1 Task 13), append `@docs/superpowers/plans/2026-05-02-plan-4-authority-graph.md`. If no such section exists, skip.

- [ ] **Step 5: Final change-detection.**

```
mcp__gitnexus__detect_changes({ scope: "all", repo: "astro-blog" })
```

Expected scope (compared to `main`):

- `src/lib/content/tags.ts`
- `src/pages/tags/index.astro`
- `src/pages/tags/{,en/}index.astro`, `src/pages/tags/{,en/}[tag].astro`
- `src/pages/{,en/}blog/index.astro`, `src/layouts/PostLayout.astro`
- `src/i18n/strings.{ru,en}.json`
- `src/content/posts/**/*.md` (one-line strip)
- `tests/unit/content/{tags,tags-index-page,tags-archive-page,tag-chip-links}.test.ts`
- `tests/unit/posts-h1.test.ts`, `tests/unit/seo/sitemap-coverage.test.ts`
- (optional) `CLAUDE.md`

Flag anything outside that list before pushing.

- [ ] **Step 6: Push branch and open PR.**

```bash
git push -u origin feat/authority-graph
gh pr create --title "feat(authority): tag archives, h1 discipline, sitemap coverage" --body "$(cat <<'EOF'
## Summary
- /tags index page (RU + EN) listing every tag slug with post counts and WebPage schema
- /tags/[tag] archive pages (RU + EN) emitting Blog JSON-LD with blogPost: [...]
- Tag chips on /blog and post pages are now clickable anchors
- Stripped duplicate leading-h1 from existing post bodies; new Vitest guard prevents regressions
- Sitemap coverage test asserts /tags, /tags/<slug>, and entity pages from Plan 2 are present

Spec: docs/superpowers/specs/2026-05-02-llm-citable-blog-design.md (EPIC D)
Plan: docs/superpowers/plans/2026-05-02-plan-4-authority-graph.md

## Test plan
- [ ] pnpm typecheck passes
- [ ] pnpm test passes (new tests under tests/unit/content/ and tests/unit/posts-h1.test.ts)
- [ ] pnpm build && pnpm test tests/unit/seo/sitemap-coverage.test.ts passes
- [ ] Visit /tags and /en/tags — chips link correctly
- [ ] Visit /blog/01-introduction — body has exactly one h1 (the layout title), tag chips are anchors

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

# Self-Review

EPIC D coverage:

- **D1 `/tags` index** → Task 2. RU + EN, `WebPage` schema, slug + count rows.
- **D2 `/tags/[slug]` archives** → Task 3. RU + EN. `getStaticPaths` enumerates the slug **union** across locales; cross-locale empty state via `tags.archiveEmpty{Ru,En}` strings. Emits `Blog` JSON-LD with `blogPost: [...]` and a `BreadcrumbList`.
- **D3 clickable chips** → Task 4. Touches `blog/index.astro` (RU + EN) and `PostLayout.astro`. Labels resolved through `i18n/tags.{ru,en}.json` via `resolveTagLabel` (Task 1).
- **D4 h1-validation** → Tasks 5 + 6. Task 5 strips ~16 leading-h1 lines that duplicate `frontmatter.title`. Task 6 adds a `unified + remark-parse` Vitest guard (immune to bash-comment lines inside fenced code blocks).
- **D5 sitemap** → Task 7. No `astro.config.ts` change (tag pages auto-discovered). Build-gated Vitest assertion checks `/tags`, `/tags/<slug>`, and Plan 2's entity pages in both locales; verifies exclusion of `/admin`, `/login`, `/api`.

Naming consistency: `PostWithMeta` imported from `~/lib/content/loader` everywhere; `Locale` from `~/i18n`; `resolveTagLabel(slug, locale, dict)`, `getAllTagSlugs({ru, en})`, `groupPostsByTag(posts)` signatures identical at every call site; `graphIds.person`/`.organization` reuse Plan 1's exports; `extraSchemaNodes` prop matches Plan 1's BaseLayout API.

Risk-callout coverage: D2 i18n union — Task 3 Step 1's test asserts both locales appear in `getStaticPaths`. D3 impact — Task 0 Step 2 + Task 4 Step 1 both run `gitnexus_impact`; Task 4 Step 7 runs `gitnexus_detect_changes` before committing. D4 strip-before-test — Task 5 ships and commits before Task 6 turns on the test; Task 6 Step 3 inverts a post temporarily to confirm the test fails loudly, then reverts.

Placeholder scan: no "TODO/TBD" inside executable steps. Owner-pending items (sameAs, avatar) are owned by Plan 1.

---

**Plan complete. Two execution options:** (1) Subagent-Driven (recommended) — fresh subagent per task with review checkpoints. (2) Inline Execution — `superpowers:executing-plans` in this session. Which approach?
