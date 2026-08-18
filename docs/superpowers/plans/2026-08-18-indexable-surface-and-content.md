# Indexable Surface and Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Submit only useful canonical pages, explicitly noindex utility/thin pages, complete the sitemap inventory, and repair the audited language/on-page defects.

**Architecture:** A shared tag indexability policy and a shared locale-sitemap builder prevent page metadata and sitemap membership from drifting. Utility-page robots directives remain explicit at the route boundary; small editorial/media corrections stay with their owning layouts/content.

**Tech Stack:** Astro content collections, TypeScript 5, Vitest 3, Playwright, XML sitemaps

**Spec:** `docs/superpowers/specs/2026-08-18-google-indexing-recovery-design.md`

## Global Constraints

- Individual tag archives are indexable only with at least 2 published, list-visible posts in that locale.
- Thin tag archives stay reachable but emit `noindex,follow` and are absent from locale sitemaps; tag indexes remain indexable.
- `/search/`, `/en/search/`, and `/login/` emit `noindex,follow` and are crawlable so robots can be read.
- `/admin/` and `/api/` remain disallowed and auth-protected.
- `/llms-full.txt` emits `X-Robots-Tag: noindex`.
- The only sitemap index is `/sitemap-index.xml`; locale children contain each canonical indexable URL once and include all project details.
- Sitemap `lastmod` values come from content dates and never from build time alone.
- Metadata-length findings are editorial diagnostics; do not mechanically pad titles/descriptions.
- Post descriptions retain the shared 200-character maximum; schema, admin actions, and translation drift tests enforce the 200/201 boundary.
- Tests must be written and observed failing before production code changes.
- Before editing any existing function, run GitNexus upstream impact analysis and record the blast radius; warn before any HIGH or CRITICAL edit.
- Before each commit, run `gitnexus_detect_changes` for `/Users/izual/astro-blog-gsc-indexing-audit`.

---

## File structure

- `src/lib/seo/indexability.ts`: named threshold and tag-archive decision.
- `src/lib/seo/sitemap.ts`: pure locale entry builder/XML renderer plus endpoint loader.
- `tests/unit/seo/indexability.test.ts`: tag threshold behavior.
- `tests/unit/seo/sitemap.test.ts`: exact locale inventory, uniqueness, project details, truthful dates.
- Existing route/content files: apply policy and audited corrections.

### Task 1: Tag policy and complete truthful sitemaps

**Files:**
- Create: `src/lib/seo/indexability.ts`
- Create: `src/lib/seo/sitemap.ts`
- Create: `tests/unit/seo/indexability.test.ts`
- Create: `tests/unit/seo/sitemap.test.ts`
- Modify: `src/pages/tags/[tag].astro`
- Modify: `src/pages/en/tags/[tag].astro`
- Modify: `src/pages/sitemap-ru.xml.ts`
- Modify: `src/pages/sitemap-en.xml.ts`
- Modify: `src/pages/sitemap-index.xml.ts`
- Modify: `tests/unit/seo/sitemap-coverage.test.ts`
- Modify: `tests/e2e/seo.spec.ts`

**Interfaces:**
- Produces: `MIN_INDEXABLE_TAG_POSTS = 2`
- Produces: `isTagArchiveIndexable(posts: readonly unknown[]): boolean`
- Produces: `buildLocaleSitemapEntries(input: SitemapInput): readonly UrlEntry[]`
- Produces: `renderUrlSet(entries: readonly UrlEntry[]): string`
- Produces: `buildLocaleSitemapResponse(locale: Locale): Promise<Response>`
- Consumes: `canonicalUrl` from the canonical URL plan.

- [ ] **Step 1: Write failing tag threshold tests**

```ts
it.each([
  [0, false],
  [1, false],
  [2, true],
  [3, true],
])("marks %i locale posts indexable=%s", (count, expected) => {
  expect(isTagArchiveIndexable(Array.from({ length: count }))).toBe(expected);
});
```

- [ ] **Step 2: Run tag tests and capture RED**

Run: `pnpm exec vitest run tests/unit/seo/indexability.test.ts`

Expected: FAIL because `~/lib/seo/indexability` does not exist.

- [ ] **Step 3: Implement and consume the named policy**

```ts
export const MIN_INDEXABLE_TAG_POSTS = 2;

export const isTagArchiveIndexable = (posts: readonly unknown[]): boolean =>
  posts.length >= MIN_INDEXABLE_TAG_POSTS;
```

Pass `noindex={!isTagArchiveIndexable(matches)}` from both locale tag archive pages. The page must still render its empty/thin state and canonical URL.

- [ ] **Step 4: Run tag tests and capture GREEN**

Run: `pnpm exec vitest run tests/unit/seo/indexability.test.ts`

Expected: four passing cases.

- [ ] **Step 5: Write failing pure sitemap inventory tests**

Construct literal RU/EN fixtures with two projects, one post, one course, one lesson, and tags with 1/2 posts. Assert:

```ts
expect(ruUrls).toContain("https://artka.dev/projects/astro-blog/");
expect(ruUrls).toContain("https://artka.dev/projects/claude-code-guide/");
expect(enUrls).toContain("https://artka.dev/en/projects/astro-blog/");
expect(enUrls).toContain("https://artka.dev/en/projects/claude-code-guide/");
expect(ruUrls).toContain("https://artka.dev/tags/seo/");
expect(ruUrls).not.toContain("https://artka.dev/tags/one-post/");
expect(new Set(ruUrls).size).toBe(ruUrls.length);
expect(entries.find((entry) => entry.loc.endsWith("/blog/post/"))?.lastmod).toBe("2026-07-12");
```

The expected dates and URLs must be fixture literals, not values generated with the production helpers.

- [ ] **Step 6: Run sitemap tests and capture RED**

Run: `pnpm exec vitest run tests/unit/seo/sitemap.test.ts`

Expected: FAIL because the shared sitemap module does not exist.

- [ ] **Step 7: Implement the shared builder and thin endpoints**

`SitemapInput` contains `locale`, ordered posts, course entries, lesson entries, project entries, and locale tag groups. Filter project IDs using the same `en/` convention as project `getStaticPaths`; strip `en/` from output slugs. Sort generated URLs by `loc`, retain the fixed navigation roots first, and throw on duplicate `loc` values. Use updated date with published-date fallback for posts/courses/projects and published date for lessons.

Each locale endpoint becomes:

```ts
export const GET: APIRoute = async () => buildLocaleSitemapResponse("ru");
```

or `"en"`. Remove build-day `lastmod` from the sitemap index; child URL lastmods remain content-derived.

- [ ] **Step 8: Run sitemap tests and rebuild**

Run: `pnpm exec vitest run tests/unit/seo/indexability.test.ts tests/unit/seo/sitemap.test.ts && pnpm build`

Expected: tests pass; generated locale maps include four project-detail URLs and exclude every tag archive below 2 posts.

- [ ] **Step 9: Strengthen generated/e2e coverage**

Update `sitemap-coverage.test.ts` to derive project-detail paths from the content tree or assert the current four exact URLs, assert no duplicate `<loc>`, assert thin tags are absent, and assert `/search/`, `/en/search/`, `/login/` are absent. Update the Playwright sitemap-index check to require `sitemap-ru.xml` and `sitemap-en.xml` and reject `sitemap-0.xml`.

- [ ] **Step 10: Run pre-commit verification and commit**

Run:

```bash
pnpm exec vitest run tests/unit/seo/indexability.test.ts tests/unit/seo/sitemap.test.ts tests/unit/seo/sitemap-coverage.test.ts
pnpm typecheck
```

Then run GitNexus change detection, stage only Task 1 files, and commit:

```bash
git commit -m "fix: align sitemap with indexability"
```

### Task 2: Utility directives, localized content, H1s, and media behavior

**Files:**
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/pages/search.astro`
- Modify: `src/pages/en/search.astro`
- Modify: `src/pages/login.astro`
- Modify: `src/pages/llms-full.txt.ts`
- Modify: `public/robots.txt`
- Modify: `src/pages/about.astro`
- Modify: `src/pages/en/about.astro`
- Modify: `src/pages/uses.astro`
- Modify: `src/pages/en/uses.astro`
- Modify: `src/pages/now.astro`
- Modify: `src/pages/en/now.astro`
- Modify: `src/content/posts/en/claude-md-12-rules.md`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `astro.config.ts`
- Create: `src/lib/rehype/lazy-content-images.ts`
- Create: `tests/unit/seo/utility-indexing.test.ts`
- Create: `tests/integration/seo-utility-routes.test.ts`
- Create: `tests/unit/seo/landing-content.test.ts`
- Create: `tests/unit/seo/media-output.test.ts`
- Modify: `tests/unit/seo/llms-full-endpoint.test.ts`
- Modify: `tests/e2e/search-page.spec.ts`

**Interfaces:**
- Consumes: `BaseLayout` boolean `noindex`; its emitted value becomes exactly `noindex,follow`.
- Produces: default unified plugin `lazyContentImages(): Transformer<Root>` registered after Mermaid rendering.
- Consumes: canonical URL policy for search actions, result links, and digest URLs.

- [ ] **Step 1: Write failing utility indexing tests**

The unit test invokes `llms-full.txt` `GET`, `buildWebSiteNode`, and reads the delivered robots artifact. The integration test starts the already-built standalone server with `PORT=0` through the shared hardened helper, a fixed test-only Better Auth secret/base URL, external service credentials masked, and no session cookie. It parses the adapter-selected origin with a deadline, fetches with abort deadlines, extracts `meta[name="robots"]`, and performs verified TERM-to-KILL cleanup in `finally`. Required behavior:

```ts
expect(searchRobots).toBe("noindex,follow");
expect(enSearchRobots).toBe("noindex,follow");
expect(loginRobots).toBe("noindex,follow");
expect(llmsResponse.headers.get("X-Robots-Tag")).toBe("noindex");
expect(websiteNode).not.toHaveProperty("potentialAction");
expect(robotsTxt).not.toMatch(/Disallow:\s*\/(?:en\/)?search/);
expect(robotsTxt).not.toMatch(/Disallow:\s*\/login/);
expect(robotsTxt).toMatch(/Disallow:\s*\/admin\//);
expect(robotsTxt).toMatch(/Disallow:\s*\/api\//);
```

- [ ] **Step 2: Run utility tests and capture RED**

Run: `pnpm build && pnpm exec vitest run tests/unit/seo/utility-indexing.test.ts tests/unit/seo/llms-full-endpoint.test.ts tests/integration/seo-utility-routes.test.ts`

Expected: failure on current `noindex,nofollow`, missing route props/header, and blocked utility pages. The SearchAction assertion is regression coverage for the canonical URL package and already passes.

- [ ] **Step 3: Implement utility policy and English search copy**

Emit exactly `noindex,follow` from `BaseLayout` when `noindex` is true. Pass `noindex={true}` from both search pages and login. Remove `/login` and `/search` disallows from every robots user-agent block while retaining `/admin/` and `/api/`. Keep the existing direct regression assertion that `buildWebSiteNode` has no `potentialAction`; do not edit the already-correct schema builder in this task. Add `X-Robots-Tag: noindex` to `llms-full.txt`.

Use this English search contract:

```text
title/H1: Search
description: Search the blog
query title: Search: {query}
form action: /en/search/
placeholder: Search…
aria-label: Search query
button: Search
empty: No results found for “{query}”.
hint: Enter a query or press ⌘K anywhere on the site.
```

- [ ] **Step 4: Run utility tests and capture GREEN**

Run: `pnpm build && pnpm exec vitest run tests/unit/seo/utility-indexing.test.ts tests/unit/seo/llms-full-endpoint.test.ts tests/integration/seo-utility-routes.test.ts`

Expected: all utility policy assertions pass.

- [ ] **Step 5: Write failing landing/language tests**

For `/about/`, `/uses/`, `/now/` and their `/en/` counterparts, assert generated HTML has exactly one visible H1 whose text is the content entry title. Parse `src/content/posts/en/claude-md-12-rules.md` frontmatter and assert title, description, summary, FAQ text, and cover alt contain no Cyrillic and are non-empty; assert the known English title is not equal to the RU title.

- [ ] **Step 6: Run landing/language tests and capture RED**

Run: `pnpm build && pnpm exec vitest run tests/unit/seo/landing-content.test.ts`

Expected: FAIL for six missing H1s and Cyrillic EN frontmatter.

- [ ] **Step 7: Add template-owned H1s and translate only EN frontmatter**

Render `<h1>{entry.data.title}</h1>` immediately after `<Breadcrumbs>` and before `Avatar`/`Content` in all six route templates. Replace only the affected English article frontmatter with these language-correct values while leaving the already-English body, `lang: en`, and current `sourceHash` unchanged; set `manuallyEdited: true`:

```yaml
title: "12 Rules for CLAUDE.md: Extending Karpathy for 2026 Failure Modes"
description: >-
  Mnilax tested 12 CLAUDE.md rules across 30 codebases over six weeks, extending Karpathy's template for agent loops, checkpoints, and fail-loud behavior. This article explains the evidence.
coverAlt: "12 rules for CLAUDE.md — an extension of Karpathy's template"
summary: >-
  Karpathy proposed four CLAUDE.md rules in January. Mnilax expanded them to twelve for token budgets, checkpoints, fail-loud behavior, and newer coding-agent failure modes. Here is what the set covers and how to adopt it without bloating the file.
faq:
  - question: "Why use CLAUDE.md if Claude Code already reads project context?"
    answer: >-
      CLAUDE.md establishes behavioral constraints before the model reads the code. Without it, Claude repeatedly guesses the stack, conventions, and prohibitions, consuming tokens and producing less consistent sessions. Anthropic describes the file as advisory, but an absent contract cannot guide behavior at all.
  - question: "Why expand the template to twelve rules if Karpathy's four were enough?"
    answer: >-
      The original rules predated today's long multi-step agents, hook chains, and cross-session workflows. Mnilax's measurements attribute an additional reduction in errors to eight rules covering those newer failure modes while keeping compliance nearly unchanged.
  - question: "Can I copy someone else's CLAUDE.md and leave it unchanged?"
    answer: >-
      It works only as a starting point. As a codebase evolves, generic rules drift away from reality. A useful CLAUDE.md is a behavioral contract for failures observed in the actual project and must evolve with that project.
  - question: "What should I do if my CLAUDE.md is already longer than 200 lines?"
    answer: >-
      Move long stack, command, and subsystem references into imported documents. Keep the root CLAUDE.md focused on rules and brief context so important constraints are not buried in noise.
  - question: "Do these rules help in an API session without Claude Code?"
    answer: >-
      Yes. Put the stable rules in the system prompt so they form a cache-friendly prefix. Budget, checkpoint, and fail-loud rules improve multi-step Anthropic SDK workflows even without the CLI.
manuallyEdited: true
```

- [ ] **Step 8: Run landing/language tests and capture GREEN**

Run: `pnpm build && pnpm exec vitest run tests/unit/seo/landing-content.test.ts`

Expected: one correct H1 per route and no Cyrillic in the specified EN metadata.

- [ ] **Step 9: Write failing media behavior tests**

Assert a built post with a cover has a non-lazy cover `<img>` with `width="1200"`, `height="630"`, and `fetchpriority="high"`. Run the lazy-image plugin over a tree containing ordinary content images and Mermaid/explicit eager images; ordinary content images receive `loading="lazy"` and `decoding="async"`, while an image with `data-eager` or `fetchpriority="high"` remains eager.

- [ ] **Step 10: Run media tests and capture RED**

Run: `pnpm exec vitest run tests/unit/seo/media-output.test.ts`

Expected: FAIL because cover dimensions and the content-image plugin are absent.

- [ ] **Step 11: Implement media behavior and register the plugin**

Add 1200×630 intrinsic dimensions and high fetch priority to the current post cover image. Keep `loading="eager"`. Implement `lazyContentImages` for Markdown/MDX content images only; do not modify site chrome, cover images, or images already declaring loading/fetch priority. Register it in both Markdown pipelines after Mermaid so generated diagram images also receive explicit dimensions/behavior only when safe; if Mermaid uses data images without intrinsic dimensions, add lazy/async without inventing dimensions.

- [ ] **Step 12: Run media tests, full focused package, and commit**

Run:

```bash
pnpm build
pnpm exec vitest run tests/unit/seo/utility-indexing.test.ts tests/unit/seo/llms-full-endpoint.test.ts tests/integration/seo-utility-routes.test.ts tests/unit/seo/landing-content.test.ts tests/unit/seo/media-output.test.ts
pnpm typecheck
```

Then run GitNexus change detection, stage only Task 2 files, and commit:

```bash
git commit -m "fix: reduce low-value index surface"
```
