# Canonical URL Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every artka.dev document one slash-suffixed URL identity and make redirects, metadata, structured data, feeds, Markdown, and internal links agree with it.

**Architecture:** A pure URL-policy module owns canonical path/URL formatting, and a pure redirect-policy module owns historical mappings. Astro configuration and every URL-producing consumer call those boundaries; a generated-output audit proves emitted links and metadata agree.

**Tech Stack:** Astro 5, TypeScript 5, unified/rehype, Vitest 3, Playwright, Node standalone adapter

**Spec:** `docs/superpowers/specs/2026-08-18-google-indexing-recovery-design.md`

## Global Constraints

- The canonical origin is exactly `https://artka.dev`.
- `/` remains `/`; public HTML paths end in `/`; file-like endpoints and assets do not gain `/`.
- Query strings and fragments are not part of canonical identity.
- English paths retain `/en/`; Russian paths have no locale prefix.
- Historical redirect destinations are final slash canonicals; `/privacy/`, `/terms/`, `/README/`, and `/en/tags/guide/` remain real 404s.
- Do not generate both slash and non-slash redirect keys for one normalized Astro route.
- Tests must be written and observed failing before production code changes.
- Before editing any existing function, run GitNexus upstream impact analysis and record the blast radius; warn before any HIGH or CRITICAL edit.
- Before each commit, run `gitnexus_detect_changes` for `/Users/izual/astro-blog-gsc-indexing-audit`.

---

## File structure

- `src/lib/seo/url-policy.ts`: pure canonical path/origin rules.
- `src/lib/seo/redirects.ts`: pure historical redirect registry and validation.
- `src/lib/rehype/canonical-internal-links.ts`: rewrites Markdown/MDX internal anchors to canonical slash form.
- `tests/unit/seo/url-policy.test.ts`: path and absolute-URL behavior.
- `tests/unit/seo/redirects.test.ts`: uniqueness, final destinations, and known migrations.
- `tests/unit/seo/canonical-internal-links.test.ts`: real unified tree transformation.
- `tests/unit/seo/generated-url-policy.test.ts`: audits built HTML/XML/JSON/text output.
- Existing layouts/components/pages/config: consume the shared policy without duplicating it.

### Task 1: Canonical URL policy, historical redirects, and emitted URL convergence

**Files:**
- Create: `src/lib/seo/url-policy.ts`
- Create: `src/lib/seo/redirects.ts`
- Create: `src/lib/rehype/canonical-internal-links.ts`
- Create: `tests/unit/seo/url-policy.test.ts`
- Create: `tests/unit/seo/redirects.test.ts`
- Create: `tests/unit/seo/canonical-internal-links.test.ts`
- Create: `tests/unit/seo/generated-url-policy.test.ts`
- Modify: `astro.config.ts`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/lib/i18n/routing.ts`
- Modify: `src/lib/i18n/routing.test.ts`
- Modify: `src/lib/seo/nodes-global.ts`
- Modify: `src/lib/feeds/build-rss.ts`
- Modify: `src/pages/courses/[course]/rss.xml.ts`
- Modify: `src/pages/en/courses/[course]/rss.xml.ts`
- Modify: `src/pages/llms-full.txt.ts`
- Modify: `public/llms.txt`
- Modify: `src/components/AuthorCard.astro`
- Modify: `src/components/Header.astro`
- Modify: `src/components/HomeAuthorCard.astro`
- Modify: `src/components/HomeTopics.astro`
- Modify: `src/components/LangToggle.astro`
- Modify: `src/components/MobileDrawer.astro`
- Modify: `src/components/PrevNext.astro`
- Modify: `src/components/RelatedPosts.astro`
- Modify: `src/components/SiteSidebar.astro`
- Modify: `src/layouts/CourseLayout.astro`
- Modify: `src/layouts/LessonLayout.astro`
- Modify: `src/layouts/PostLayout.astro`
- Modify: `src/lib/feeds/build-json-feed.ts`
- Modify: `src/lib/seo/nodes-page.ts`
- Modify: `src/pages/blog/index.astro`
- Modify: `src/pages/en/blog/index.astro`
- Modify: `src/pages/courses/[course]/index.astro`
- Modify: `src/pages/en/courses/[course]/index.astro`
- Modify: `src/pages/courses/[course]/[lesson].astro`
- Modify: `src/pages/en/courses/[course]/[lesson].astro`
- Modify: `src/pages/projects/index.astro`
- Modify: `src/pages/en/projects/index.astro`
- Modify: `src/pages/projects/[slug].astro`
- Modify: `src/pages/en/projects/[slug].astro`
- Modify: `src/pages/tags/index.astro`
- Modify: `src/pages/en/tags/index.astro`
- Modify: `src/pages/tags/[tag].astro`
- Modify: `src/pages/en/tags/[tag].astro`
- Modify: `src/content/courses/claude-code-guide/14-claims-verification.md`
- Modify: `src/content/courses/claude-code-guide/en/14-claims-verification.md`
- Modify: `tests/e2e/seo.spec.ts`

**Interfaces:**
- Produces: `isFileLikePath(pathname: string): boolean`
- Produces: `canonicalPath(pathname: string): string`
- Produces: `canonicalUrl(pathname: string, site?: string | URL): string`
- Produces: `buildLegacyRedirects(): Readonly<Record<string, string>>`
- Produces: default unified plugin `canonicalInternalLinks(): Transformer<Root>`
- Consumes: existing `getCounterpart(pathname, locale)` and `checkCounterpartExists(pathname, locale)`; their results must be passed through `canonicalPath`/`canonicalUrl`.

- [ ] **Step 1: Write failing URL-policy tests with hand-derived literals**

```ts
import { canonicalPath, canonicalUrl, isFileLikePath } from "~/lib/seo/url-policy";

it.each([
  ["/", "/"],
  ["/blog", "/blog/"],
  ["/blog/", "/blog/"],
  ["/en//about?draft=1#bio", "/en/about/"],
  ["/sitemap-index.xml?x=1", "/sitemap-index.xml"],
  ["/images/cover.svg", "/images/cover.svg"],
])("normalizes %s to %s", (input, expected) => {
  expect(canonicalPath(input)).toBe(expected);
});

it("uses the apex HTTPS origin and discards query/fragment identity", () => {
  expect(canonicalUrl("/en/blog/post?q=1#x", "https://preview.invalid/base/"))
    .toBe("https://preview.invalid/en/blog/post/");
  expect(canonicalUrl("/about")).toBe("https://artka.dev/about/");
});

it.each(["/rss.xml", "/feed.json", "/llms-full.txt", "/og/post.png"])(
  "recognizes file endpoint %s",
  (path) => expect(isFileLikePath(path)).toBe(true),
);
```

- [ ] **Step 2: Run the focused test and capture RED**

Run: `pnpm exec vitest run tests/unit/seo/url-policy.test.ts`

Expected: FAIL because `~/lib/seo/url-policy` does not exist.

- [ ] **Step 3: Implement the pure URL-policy boundary**

```ts
export const CANONICAL_ORIGIN = "https://artka.dev";

export const isFileLikePath = (pathname: string): boolean =>
  /\/[^/?#]+\.[a-z0-9]{1,12}$/i.test(new URL(pathname, CANONICAL_ORIGIN).pathname);

export const canonicalPath = (pathname: string): string => {
  const parsed = new URL(pathname, CANONICAL_ORIGIN);
  const collapsed = parsed.pathname.replace(/\/{2,}/g, "/");
  if (collapsed === "/") return "/";
  const bare = collapsed.replace(/\/+$/, "");
  return isFileLikePath(bare) ? bare : `${bare}/`;
};

export const canonicalUrl = (
  pathname: string,
  site: string | URL = CANONICAL_ORIGIN,
): string => new URL(canonicalPath(pathname), site).toString();
```

- [ ] **Step 4: Run URL-policy tests and capture GREEN**

Run: `pnpm exec vitest run tests/unit/seo/url-policy.test.ts`

Expected: all table rows pass with pristine output.

- [ ] **Step 5: Write failing redirect-registry tests**

```ts
import { buildLegacyRedirects } from "~/lib/seo/redirects";
import { canonicalPath } from "~/lib/seo/url-policy";

it("defines one Astro route per normalized legacy source", () => {
  const redirects = buildLegacyRedirects();
  const normalized = Object.keys(redirects).map(canonicalPath);
  expect(new Set(normalized).size).toBe(normalized.length);
});

it("maps representative RU, EN, root, and concatenated lessons to final canonicals", () => {
  expect(buildLegacyRedirects()).toMatchObject({
    "/blog/02-context-and-cache/": "/courses/claude-code-guide/02-context-and-cache/",
    "/en/blog/02-context-and-cache/": "/en/courses/claude-code-guide/02-context-and-cache/",
    "/03-claude-md/": "/courses/claude-code-guide/03-claude-md/",
    "/courses/claude-code-guide/11-models-and-pricing/12-travel-agent-blueprint/":
      "/courses/claude-code-guide/12-travel-agent-blueprint/",
  });
});

it.each(["/privacy/", "/terms/", "/README/", "/en/tags/guide/"])(
  "does not invent a redirect for %s",
  (path) => expect(buildLegacyRedirects()).not.toHaveProperty(path),
);

it("uses slash canonical destinations", () => {
  expect(Object.values(buildLegacyRedirects()).every((path) => canonicalPath(path) === path))
    .toBe(true);
});
```

- [ ] **Step 6: Run redirect tests and capture RED**

Run: `pnpm exec vitest run tests/unit/seo/redirects.test.ts`

Expected: FAIL because `~/lib/seo/redirects` does not exist.

- [ ] **Step 7: Implement and wire the redirect registry**

Create a frozen 14-slug course list. Generate exactly one slash-form source for RU/EN `/blog/<lesson>/`, all root lesson slugs, and the audited concatenations ending in the final lesson. Keep the three removed post redirects to `/blog/` and `/en/blog/`; map legacy `/igaming/` to `/blog/`; omit `/privacy/`. Export only `buildLegacyRedirects()` and immutable slug data needed by tests.

In `astro.config.ts`, set:

```ts
trailingSlash: "always",
redirects: buildLegacyRedirects(),
```

Delete the inline duplicate-key IIFE. Register `canonicalInternalLinks` after `remarkStripMdSuffix` for both MDX and Markdown pipelines.

- [ ] **Step 8: Run redirect tests and build once to capture GREEN/no collision warning**

Run: `pnpm exec vitest run tests/unit/seo/redirects.test.ts && pnpm build`

Expected: tests pass; build output contains no `static route cannot be defined more than once` warning.

- [ ] **Step 9: Write a failing real-tree rehype test**

```ts
const input = [
  '<a href="/about">about</a>',
  '<a href="./next">next</a>',
  '<a href="https://artka.dev/en/blog/post?x=1#part">post</a>',
  '<a href="/rss.xml">rss</a>',
  '<a href="#local">local</a>',
].join("");

expect(await renderWithCanonicalInternalLinks(input)).toContain('href="/about/"');
expect(await renderWithCanonicalInternalLinks(input)).toContain('href="./next/"');
expect(await renderWithCanonicalInternalLinks(input))
  .toContain('href="https://artka.dev/en/blog/post/#part"');
expect(await renderWithCanonicalInternalLinks(input)).toContain('href="/rss.xml"');
expect(await renderWithCanonicalInternalLinks(input)).toContain('href="#local"');
```

Construct a real HAST `Root` with five `Element` anchor children, invoke the plugin's transformer on that tree, and assert the five literal `properties.href` values above. Do not import an unlisted parser dependency and do not assert source text.

- [ ] **Step 10: Run the rehype test and capture RED**

Run: `pnpm exec vitest run tests/unit/seo/canonical-internal-links.test.ts`

Expected: FAIL because the plugin does not exist.

- [ ] **Step 11: Implement the plugin and converge metadata/feeds/links**

The plugin must leave fragments, `mailto:`, `tel:`, protocol-relative URLs, non-artka external URLs, and file-like URLs unchanged. It must preserve a fragment while discarding query identity on canonical artka.dev URLs and append `/` to root-relative and `./`/`../` internal document links.

Use `canonicalUrl` in `BaseLayout` for canonical, OG URL, and hreflang. Use `canonicalPath` in `getCounterpart`. Return `false` for counterpart availability on `/login/`, `/admin/*`, and `/api/*`. Remove `SearchAction` from `buildWebSiteNode`. Convert schema, RSS, feed, navigation, breadcrumb, course, project, and tag URL producers to slash output. Remove the two `./README` links from lesson 14 because `/README/` is deliberately absent.

- [ ] **Step 12: Add a failing generated-output audit and run it against the baseline artifact**

The test recursively reads `dist/client/**/*.html`, resolves every internal `<a href>` against that page's canonical, and reports tuples `{ file, href, resolved }` when a document URL differs from `canonicalPath(resolved.pathname)`. It also parses canonical/hreflang/`og:url`, JSON-LD URL-like values, sitemap `<loc>`, feed links, `public/llms.txt`, and built `llms-full.txt`; every artka.dev document URL must be apex HTTPS and canonical. File endpoints, fragments, mail/tel, and non-artka origins are excluded.

Run: `pnpm exec vitest run tests/unit/seo/generated-url-policy.test.ts`

Expected: FAIL with the current no-slash internal URLs.

- [ ] **Step 13: Rebuild, use the failure list to update every URL-producing consumer, and capture GREEN**

Run: `pnpm build && pnpm exec vitest run tests/unit/seo/url-policy.test.ts tests/unit/seo/redirects.test.ts tests/unit/seo/canonical-internal-links.test.ts tests/unit/seo/generated-url-policy.test.ts src/lib/i18n/routing.test.ts`

Expected: all tests pass; generated audit returns an empty violation array.

- [ ] **Step 14: Update rendered SEO assertions**

Change `tests/e2e/seo.spec.ts` to request slash routes, assert `hreflang="ru-RU"`, `hreflang="en-US"`, and `x-default`, and assert `/login/` has no locale alternates. Keep the sitemap-child expectation for the inventory plan.

- [ ] **Step 15: Run pre-commit verification and commit**

Run:

```bash
pnpm typecheck
pnpm exec vitest run tests/unit/seo/url-policy.test.ts tests/unit/seo/redirects.test.ts tests/unit/seo/canonical-internal-links.test.ts tests/unit/seo/generated-url-policy.test.ts src/lib/i18n/routing.test.ts
```

Then run GitNexus change detection, review affected flows, stage only files in this task, and commit:

```bash
git commit -m "fix: unify canonical URL identity"
```
