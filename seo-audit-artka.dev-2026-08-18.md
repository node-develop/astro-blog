# Google indexing audit: artka.dev

Date: 2026-08-18

Search Console snapshot: 2026-08-14

Code baseline: `origin/main` at `875316a3887a231e96e39303deb701f3cdfa2b7d`

Audit mode: read-only Google Search Console + live-site checks + fresh-build repository inspection

## Executive summary

The site is crawlable, the primary sitemap is valid, and Google is already finding the content. The central failure is that the site exposes competing URL identities and then asks Google to make too many low-confidence indexing decisions. Search Console reports only **8 indexed URLs** and **178 excluded URL samples**, but those 178 are not 178 unique current pages: they include trailing-slash duplicates, legacy redirects, broken URLs, blocked search variants, and historical URLs.

The most important evidence is the **104 “Crawled — currently not indexed” URLs**. Of those, 58 are exact canonical URLs from the current sitemap. Google has fetched them and still declined to index them. This means the problem is not solved by resubmitting the sitemap or changing robots.txt alone. Technical signal cleanup must be followed by reducing thin/duplicated indexable pages and strengthening the remaining canonical pages.

The immediate order of operations is:

1. Enforce one trailing-slash convention with server redirects and matching internal links, canonicals, hreflang, structured data, and sitemap URLs.
2. Repair the broken/legacy URL graph and the `www` hostname.
3. Shrink and improve the indexable surface, then validate fixes in Search Console after deployment.

## Current Search Console snapshot

| Status                                        | URLs | Notes                                                        |
| --------------------------------------------- | ---: | ------------------------------------------------------------ |
| Indexed                                       |    8 | Only 8 URLs may appear in Google Search                      |
| Not indexed                                   |  178 | Seven reported reasons; includes aliases and historical URLs |
| Crawled, currently not indexed                |  104 | Main problem; 58 are exact current-sitemap URLs              |
| Not found (404)                               |   30 | Broken course links, legacy roots, missing pages, and `www`  |
| Redirect                                      |   14 | Mostly legacy `/blog/<course-lesson>` URLs                   |
| Alternate page with proper canonical          |   14 | All sampled URLs are non-slash aliases of slash canonicals   |
| Discovered, currently not indexed             |   13 | Mostly tag archives and `/now/`; Google has not crawled them |
| Blocked by robots.txt                         |    2 | Search page and SearchAction query template                  |
| Duplicate; Google chose a different canonical |    1 | `/blog/04-skills/`, first detected 2026-05-16                |

Important: Search Console is a lagging report. For example, `/blog/04-skills/` now redirects, but its historical canonical-mismatch row remains in the report. Fixes should be validated only after the live behavior is correct.

## Top 3 priority fixes

### #1. Make every page have exactly one URL identity

**Impact:** Very high

**Complexity:** 1–2 days

**Block:** Canonicalization, internal linking, redirects

**Current state**

- The origin returns `200` for both `/path` and `/path/`.
- 2,541 of 2,814 generated internal links (90.3%) use the non-slash form, while sitemap URLs and most generated canonicals use the slash form.
- Dynamic routes can self-canonicalize both variants. On production, `/blog` emits canonical `/blog`, while `/blog/` emits canonical `/blog/`.
- Search Console separately reports 14 alternate canonical URLs, 14 redirects, and 32 non-slash aliases inside the 104 crawled-not-indexed URLs.
- Within the crawled-not-indexed export, 23 page identities appear as both slash and non-slash URLs (46 URL samples).
- There is no global `trailingSlash` policy in `astro.config.ts`.

**What to do**

1. Adopt the slash form because it is already used in the current sitemaps and most generated static canonicals.
2. Set a global Astro URL policy (`trailingSlash: "always"`) and ensure the deployment layer issues a permanent redirect from every non-slash HTML URL to its slash canonical.
3. Make canonical, hreflang, Open Graph URL, JSON-LD URL, sitemap entries, navigation, breadcrumbs, feeds, and all content links use the same helper.
4. Change redirect destinations to their final slash canonical so legacy URLs do not land on another 200 alias.
5. Regenerate the site and assert that each normalized page has one `200` URL; every other form must be a single-hop `301`/`308`.

**Expected result**

Google receives one consistent identity per page. The alternate-canonical and duplicate clusters stop growing, crawl capacity is no longer spent on aliases, and link equity is consolidated.

### #2. Repair the broken and historical URL graph

**Impact:** Very high

**Complexity:** 1–3 days

**Block:** Crawlability, redirects, hostname configuration

**Current state**

Search Console reports 30 404 URLs. The patterns reveal actual link-generation and migration defects:

- Concatenated lesson paths such as `/courses/claude-code-guide/11-models-and-pricing/12-travel-agent-blueprint` and `/08-tool-calls-and-loop/09-subagents`.
- English concatenations such as `/en/courses/.../12-travel-agent-blueprint/04-skills`.
- Old root lesson URLs including `/03-claude-md`, `/04-skills`, `/05-hooks`, `/06-mcp`, `/08-tool-calls-and-loop`, `/10-agent-teams`, `/12-travel-agent-blueprint`, and `/14-claims-verification`.
- Missing or unintended URLs: `/terms`, `/README`, and `/en/tags/guide`.
- `https://www.artka.dev/` has an invalid TLS certificate and returns `404` if TLS verification is bypassed.

The current redirect table only covers one root lesson (`/02-context-and-cache`) and generates duplicate normalized route definitions. A build currently emits 37 duplicate static-route collision warnings.

**What to do**

1. Find and replace relative lesson navigation that concatenates the current lesson path; generate absolute course lesson URLs from one URL helper.
2. Redirect valid historical lesson URLs directly to their exact slash canonical course URLs.
3. For truly removed URLs, return `410` or a real `404`; do not blanket-redirect unrelated URLs to the homepage.
4. Fix the `www` DNS/certificate and permanently redirect `http://www` and `https://www` to `https://artka.dev/`, or remove the `www` DNS record completely.
5. Collapse the Astro redirect registry so it does not declare both normalized forms as competing static routes.
6. Remove the obsolete `https://artka.dev/sitemap.xml` submission after the canonical sitemap is deployed and verified. It is still marked “successful” in Search Console from 2025 but currently returns `404`.

**Expected result**

Google stops spending crawls on malformed and legacy paths, all historical equity flows in one hop to a current canonical, and build-time redirect ambiguity disappears.

### #3. Reduce low-value indexable inventory and strengthen canonical pages

**Impact:** Very high

**Complexity:** 3–7 days initially, then ongoing

**Block:** Index selection, on-page quality, information architecture

**Current state**

The 104 crawled-not-indexed URL samples break down as follows:

| Family               | URLs |
| -------------------- | ---: |
| Course pages/lessons |   43 |
| Tag pages            |   24 |
| Blog posts           |   21 |
| Project details      |    5 |
| Other landing pages  |    6 |
| Blog indexes         |    2 |
| Projects index       |    1 |
| Search               |    1 |
| RSS                  |    1 |

After URL normalization, those 104 samples represent 81 distinct page identities. Of the 104 samples:

- 58 are exact current sitemap URLs.
- 32 are non-slash aliases of current sitemap URLs.
- 14 are absent from the current sitemap.

Google has therefore crawled most of the intended surface but is withholding indexing. The site also exposes many small tag archives, six static landing pages without an H1, and an English article whose title, description, and H1 remain Russian.

**What to do**

1. Decide which tag archives deserve search visibility. Add `noindex,follow` to thin/duplicative tag pages and remove them from the sitemap, or make the retained tag hubs materially distinct and useful.
2. Add a single descriptive H1 to `/about/`, `/uses/`, `/now/` and their English equivalents.
3. Correct `/en/blog/claude-md-12-rules/`; it currently duplicates Russian title/meta/H1 in the English tree.
4. Normalize overly short/long titles and descriptions, beginning with the 58 canonical sitemap URLs Google already crawled but rejected.
5. Strengthen contextual internal links from the homepage, blog indexes, course overview, and relevant articles to the priority pages; do not rely on tag archives as the main discovery path.
6. Add the four missing project detail canonicals to the locale sitemaps.

**Expected result**

The sitemap becomes a high-confidence set of distinct pages rather than an inventory of every possible archive. Google has fewer ambiguous pages to evaluate and stronger internal evidence for the pages that should rank.

---

## Detailed findings

### 1. Canonical URL and trailing-slash fragmentation — P0

This is the most pervasive technical defect.

- Both variants return `200`:
  - `https://artka.dev/blog`
  - `https://artka.dev/blog/`
  - `https://artka.dev/blog/robots-txt-ai-crawlers-2026`
  - `https://artka.dev/blog/robots-txt-ai-crawlers-2026/`
- Static posts generally emit a slash canonical even when requested without a slash.
- Non-prerendered routes derive the canonical from `Astro.url.pathname` (`src/layouts/BaseLayout.astro:60-68`), so `/blog` and `/blog/` can each self-canonicalize.
- The sitemap uses slash URLs (`src/pages/sitemap-ru.xml.ts:74-104`, `src/pages/sitemap-en.xml.ts:69-99`).
- Main navigation uses mostly non-slash URLs.
- Search Console’s 14 “alternate page with canonical” examples are all non-slash aliases, including posts, tag archives, project pages, and a course lesson.

Representative Search Console aliases:

- `/blog/claude-md-12-rules`
- `/en/blog/robots-txt-ai-crawlers-2026`
- `/en/projects/astro-blog`
- `/en/projects/claude-code-guide`
- `/courses/claude-code-guide/06-mcp`
- `/tags/schema-org`
- `/en/tags/prompt-engineering`

### 2. Google is crawling but declining to index — P0

This is not a global robots or sitemap failure:

- The primary sitemap index is successful in Search Console.
- Search Console discovered 78 URLs from it.
- The sitemap was last processed on 2026-08-09.
- Live robots.txt allows public pages and references the correct sitemap index.
- Sampled sitemap URLs return `200`, have canonical tags, reciprocal hreflang, and no accidental `noindex`.
- 58 exact sitemap URLs are nevertheless in “Crawled — currently not indexed.”

The crawled-not-indexed count rose from 3 on 2026-05-22 to 63 on 2026-06-02, then to 104 by 2026-07-25, where it remained through 2026-08-14. This growth coincides with Google discovering the expanded content surface and its aliases.

Technical cleanup is necessary, but it does not guarantee that Google will index every page. The correct goal is a smaller, cleaner, internally prioritized set of pages.

### 3. Broken URLs and malformed lesson navigation — P0

The 30 Search Console 404s fall into four actionable groups:

1. **Concatenated course lessons.** The next lesson slug is appended to the current lesson URL instead of replacing the slug.
2. **Legacy root lesson slugs.** Old URLs are missing the `/courses/claude-code-guide/` prefix.
3. **Unimplemented pages.** `/terms`, `/README`, and `/en/tags/guide` were discovered but do not exist.
4. **Broken host.** `https://www.artka.dev/` cannot establish a valid TLS connection and resolves to a `404` service.

This should be fixed at the link source and with a complete, one-hop historical redirect map. Redirects alone will not prevent new malformed URLs from being generated.

### 4. Redirect definitions collide during build — P0

`astro.config.ts:93-160` explicitly creates both slash and non-slash redirect keys. Astro normalizes static output paths, so the fresh build reports 37 route collisions across 74 redirect keys. Astro warns that this will become an error in a future release.

The affected redirect families are:

- 28 RU/EN course lesson migrations.
- 6 RU/EN removed-post migrations.
- 3 legacy root families.

The fresh build succeeds today, but the warning is both an SEO symptom and a future deployment blocker.

### 5. `www.artka.dev` is broken — P0

Current live behavior:

- `http://artka.dev/` permanently redirects to the HTTPS apex.
- `https://artka.dev/` returns `200`.
- `https://www.artka.dev/` fails certificate validation.
- With certificate checks bypassed for diagnosis, the `www` origin returns `404` instead of redirecting.

Search Console has discovered the broken `www` homepage and records it in the 404 bucket. Fix this at DNS/TLS/edge level, not in Astro alone.

### 6. Sitemaps omit all project detail pages — P1

The application generates project detail routes, but the two locale sitemap builders only add the project index. The missing canonical URLs are:

- `https://artka.dev/projects/astro-blog/`
- `https://artka.dev/projects/claude-code-guide/`
- `https://artka.dev/en/projects/astro-blog/`
- `https://artka.dev/en/projects/claude-code-guide/`

This is why the intended public surface is at least 82 substantive HTML routes while Search Console discovers only 78 from the current sitemap.

### 7. Search is advertised to Google and then blocked — P1

Search Console’s two robots-blocked URLs are:

- `https://artka.dev/search/`
- `https://artka.dev/search?q={search_term_string}`

The second URL comes directly from the sitewide WebSite JSON-LD SearchAction (`src/lib/seo/nodes-global.ts:53-65`). At the same time, robots.txt blocks `/search` for all crawlers (`public/robots.txt:69-74`). The search pages do not pass `noindex` to `BaseLayout`.

Recommended policy:

1. Remove the SearchAction unless Google should crawl a real, indexable search experience.
2. Mark `/search`, `/en/search`, and `/login` as `noindex,follow`.
3. Allow Google to fetch those pages long enough to process `noindex`; do not rely on robots blocking as the index-removal mechanism.
4. Fix the English search page: its form submits to `/search`, its title/H1 are Russian, and it sends English users into the Russian route.

### 8. Discovered but never crawled pages show low crawl priority — P1

Search Console lists 13 URLs with no recorded crawl:

- `/courses/claude-code-guide/05-hooks/`
- `/en/courses/claude-code-guide/05-hooks/`
- `/now/`
- `/en/now/`
- `/tags/`
- `/tags/claude-code/`
- `/tags/deepseek/`
- `/tags/local-inference/`
- `/tags/seo/`
- `/en/tags/ai-crawlers/`
- `/en/tags/claude-code/`
- `/en/tags/deepseek/`
- `/en/tags/local-inference/`

Most are low-information archives or status pages. Combined with the duplicate URL surface, this suggests Google is assigning low crawl priority to them. Do not submit thin archives merely because they exist.

### 9. On-page quality defects — P1

The static-output audit found:

- Six pages without an H1: `/about/`, `/uses/`, `/now/` and their English equivalents.
- `/en/blog/claude-md-12-rules/` has Russian title, meta description, and H1, duplicating the RU page in the English hierarchy.
- 28 of 78 static pages have titles shorter than 30 characters.
- 34 of 78 have titles longer than 60 characters.
- 30 of 78 have descriptions shorter than 70 characters.
- 38 of 78 have descriptions longer than 160 characters.

Length alone is not an indexing blocker, but the combined pattern makes the page set look templated and weakens search-result relevance. Fix priority pages first rather than mechanically rewriting every tag page.

### 10. Hreflang and noindex edge cases — P2

- `BaseLayout` supports `noindex`, but `/login`, `/search`, and `/en/search` do not use it.
- `checkCounterpartExists` validates counterparts only for blog posts and returns `true` for all other routes (`src/lib/i18n/routing.ts:26-44`). As a result, `/login` can emit an `/en/login` hreflang even though that route does not exist.
- The `noindex` implementation currently emits `noindex,nofollow`; for internal utility pages, `noindex,follow` is usually the more useful policy.

### 11. Secondary technical hygiene — P2/P3

- `llms-full.txt` aggregates post excerpts and is crawlable without an `X-Robots-Tag: noindex`; it can compete as a text document or create duplicate snippets.
- The sitemap index writes today’s date as both child-sitemap `lastmod` values on every build (`src/pages/sitemap-index.xml.ts:13-24`), even when content did not change.
- An end-to-end sitemap test still expects obsolete `sitemap-0.xml` behavior.
- Ten article cover images lack explicit width/height, creating avoidable CLS risk.
- Thirty course lesson images are eagerly loaded; below-the-fold images should be lazy.
- The CSS optimizer reports an invalid `::view-transition-group([transition-name^="post-title"])` selector state.
- Rollup reports a circular cross-chunk re-export between `src/lib/seo/landing.ts` and `src/lib/seo/schema.ts` on six landing pages and warns that execution order may break.
- Public non-prerendered routes require a valid auth secret through middleware. In the local production smoke test, `/`, `/blog/`, `/en/`, and `/en/blog/` return `500` when `BETTER_AUTH_SECRET` is missing. Production currently serves them, so this is a deployment-safety gap, not a confirmed live outage.

## What is already healthy

- HTTPS apex routing works.
- `robots.txt` is reachable, permits public crawling, and declares the correct sitemap index.
- The primary sitemap index and both locale child sitemaps are valid and return `200`.
- All 78 current sitemap URLs tested return `200` without redirect chains.
- All 78 generated static pages have a title, description, canonical tag, reciprocal hreflang set, and valid JSON-LD.
- No accidental `meta robots` or `X-Robots-Tag` blocks were found on sampled public pages.
- No static orphan pages were found; each generated page has at least two incoming internal links.
- A nonexistent URL returns a real `404`.
- Search results already show some RU/EN pages, so the domain is not globally suppressed.

## Indexed URLs (Search Console)

As of the 2026-08-14 report, Google lists these eight URLs as indexed:

1. `https://artka.dev/en/`
2. `https://artka.dev/`
3. `https://artka.dev/blog/robots-txt-ai-crawlers-2026`
4. `https://artka.dev/en/courses/claude-code-guide/14-claims-verification/`
5. `https://artka.dev/blog/json-ld-graph-astro/`
6. `https://artka.dev/courses/claude-code-guide/02-context-and-cache/`
7. `https://artka.dev/en/blog/local-coding-agent/`
8. `https://artka.dev/en/projects/`

One indexed URL is itself listed without the slash used by its canonical, reinforcing the need for server-side URL normalization rather than relying on canonical tags alone.

## Sitemap status in Search Console

| Submitted sitemap                     | Submitted  | Last processed | Status                    | Discovered |
| ------------------------------------- | ---------- | -------------- | ------------------------- | ---------: |
| `https://artka.dev/sitemap-index.xml` | 2026-05-02 | 2026-08-09     | Successful                |         78 |
| `https://artka.dev/sitemap.xml`       | 2025-05-18 | 2025-10-07     | Successful (stale report) |          1 |

The legacy `sitemap.xml` currently returns `404`. Keep only the canonical sitemap index after the deployment is corrected.

## Implementation sequence

### Release 1 — URL identity and crawl graph

1. Add one URL-normalization helper and a global trailing-slash policy.
2. Update all generated internal URLs to the slash form.
3. Add edge/server permanent redirects from non-slash HTML routes to slash routes.
4. Rebuild the historical redirect map with direct canonical destinations.
5. Fix malformed lesson links at their source.
6. Repair or remove `www` DNS and TLS.
7. Eliminate all Astro redirect collision warnings.

### Release 2 — Sitemap and indexable-surface cleanup

1. Add the four project detail URLs to locale sitemaps.
2. Remove SearchAction and add correct noindex behavior to utility pages.
3. Choose which tag pages remain indexable; remove deliberate noindex pages from sitemaps.
4. Add missing H1s and fix the untranslated English page.
5. Replace synthetic sitemap `lastmod` dates with real content update dates.

### After deployment — Search Console actions

Do these only after live verification:

1. Re-submit `sitemap-index.xml` and remove the obsolete `sitemap.xml` submission.
2. Inspect a small representative set: homepage, blog index, one RU article, one EN article, one course lesson, and one project detail.
3. Request indexing for those representative canonical URLs, not for every alias.
4. Start validation for the 404, redirect, alternate-canonical, and duplicate-canonical buckets.
5. Review the trend weekly for 4–8 weeks. Search Console processing is not immediate.

## Acceptance criteria

- Every intended HTML page has exactly one `200` URL.
- Every alternative slash, host, and legacy form resolves in one permanent redirect to the canonical.
- Canonical, hreflang, JSON-LD, Open Graph, internal links, feeds, and sitemaps all use the same URL.
- The build emits zero duplicate-route warnings.
- `www.artka.dev` has a valid certificate and redirects to the apex, or its DNS record is removed.
- The sitemap includes every intended indexable project page and excludes noindex utility/thin pages.
- SearchAction no longer points Google at a robots-blocked URL.
- Every indexable page has one useful H1 and language-correct unique metadata.
- Search Console’s alternate/duplicate/404 buckets stop growing.
- Over the following 4–8 weeks, crawled-not-indexed decreases and indexed canonical URLs increase.

## Verification baseline

- `pnpm install --frozen-lockfile`: passed.
- `pnpm typecheck`: passed with 0 errors and 19 hints.
- `pnpm build`: passed, with 37 duplicate-route collision warnings.
- Runnable tests: 554 passed; 23 integration tests were skipped.
- Five integration suites could not initialize because this environment has no container runtime for Testcontainers/Postgres; the full `pnpm test` command therefore exits non-zero even though every runnable test passed.
