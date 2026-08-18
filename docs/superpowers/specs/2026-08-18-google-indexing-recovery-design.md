# artka.dev Google Indexing Recovery Design

Date: 2026-08-18

Status: approved for implementation

Evidence: `seo-audit-artka.dev-2026-08-18.md`

## Objective

Turn artka.dev from a site that exposes competing URL identities and a noisy indexable surface into a site with one deterministic canonical URL per document, a complete clean sitemap, explicit utility-page indexing policy, and regression tests that fail when crawl signals diverge.

The work targets every repository-level issue identified in the audit. DNS/TLS repair for `www.artka.dev`, deployment, and post-deploy Search Console validation are external follow-ups because they cannot be completed by a source-code change alone.

## Success criteria

1. Every public HTML document has one slash-suffixed canonical URL.
2. A non-slash GET/HEAD document request receives a production Node `301`; every repository-owned non-GET producer already uses the slash endpoint, and the edge uses method-preserving `307`/`308` for slashless non-idempotent traffic.
3. Known already-slashed legacy URLs resolve directly to the final canonical. The edge collapses slashless legacy aliases directly to that final destination; the local standalone adapter truthfully takes two `301` hops. Unmatched URLs return a real `404` and do not create duplicate build routes.
4. Internal links, canonical, hreflang, Open Graph, JSON-LD, RSS, and sitemaps use the same URL policy.
5. Thin tag archives are `noindex,follow` and excluded from sitemaps; useful tag hubs remain indexable.
6. All intended project detail pages are included in sitemaps.
7. Search and login pages are explicitly `noindex,follow`, and structured data does not advertise a blocked internal search URL.
8. Every indexable landing page has one language-correct H1 and metadata.
9. The build has no duplicate redirect-route collisions, invalid view-transition selector warning, or SEO chunk-cycle warning.
10. Automated tests cover URL normalization, redirect coverage, sitemap coverage, indexing policy, metadata, anonymous public-route behavior, canonical POST delivery, and freshly built output.

## Scope

### In scope

- Astro routing and trailing-slash policy.
- Legacy course and removed-content redirects.
- Internal URL generation in layouts, components, Markdown processing, feeds, and schema.
- Sitemap completeness and truthful `lastmod` behavior.
- Tag archive indexability.
- Search/login noindex behavior and English search localization.
- H1 and English metadata defects identified by the audit.
- `llms-full.txt` search-engine indexing header.
- Image dimensions/lazy-loading defects that can be fixed centrally or from known content.
- Auth middleware behavior for anonymous public requests when no auth cookie is present.
- Existing build warning cleanup and SEO test corrections.
- A deployment/Search Console runbook for external actions.

### Out of scope

- Promising that Google will index every submitted page.
- Rewriting every article for search intent.
- Purchasing or configuring a certificate without access to the TLS/DNS provider.
- Deploying production or mutating Search Console before the user explicitly requests those steps.
- Redirecting unrelated removed URLs to the homepage merely to suppress 404 reports.

## Architectural classification

This is an architectural change. URL identity is an interface consumed by every page, crawler artifact, external backlink, and Search Console report. The work also crosses routing, content, middleware, SEO schema, generated output, and deployment behavior.

## Approaches considered

### A. Repository-enforced slash canonicals — selected

Set `trailingSlash: "always"`, centralize URL formatting, fix all generated links, and keep explicit historical redirects in source control. The Node standalone adapter performs production `301` redirects for non-slash GET requests before rendering. Tests start the built server and verify actual behavior.

Advantages:

- Matches current sitemap and most generated static canonicals.
- Works in local production-equivalent verification.
- Keeps the URL contract reviewable and testable with the application.
- Uses Astro’s supported routing behavior.

Trade-off: Astro's standalone slash normalizer hardcodes `301` before middleware for every method. Repository clients therefore emit canonical non-GET paths, while method-preserving normalization and direct slashless-legacy collapse are mandatory edge contracts verified after deployment.

### B. Edge-only normalization — rejected

Configure slash and host redirects only at a CDN or reverse proxy. This could be the fastest runtime path, but the repository contains no authoritative edge configuration, tests could not prove the behavior, and local/generated SEO signals would remain inconsistent.

### C. Migrate canonicals to non-slash URLs — rejected

This matches most current internal links but conflicts with directory-format static output, the submitted sitemaps, and the canonical form Google has already seen. It requires a larger migration for no indexing benefit.

## URL policy

### Canonical path rules

- `/` remains `/`.
- Public HTML paths end with `/`.
- File-like endpoints and assets (`.xml`, `.json`, `.txt`, `.png`, `.svg`, `.css`, `.js`, and similar) never receive an added slash.
- Query strings and fragments are not part of canonical identity.
- The canonical host is `https://artka.dev`.
- Locale prefixes remain `/en/` for English and no prefix for Russian.

### Shared implementation boundary

Create a small pure module, `src/lib/seo/url-policy.ts`, that owns:

- `canonicalPath(pathname: string): string`
- `canonicalUrl(pathname: string, site?: string | URL): string`
- `isFileLikePath(pathname: string): boolean`

The module must not depend on Astro runtime globals so unit tests, sitemap endpoints, layouts, and build audits can use it.

`BaseLayout` will use the module for canonical and hreflang values. Sitewide JSON-LD builders, RSS helpers, sitemap builders, navigation data, tag links, course links, and project links will use the same contract.

Markdown-authored internal links will be normalized in the existing Markdown/rehype pipeline, not by rewriting prose files mechanically. A generated-output test will fail on any public internal `<a href>` that violates the policy.

## Redirect design

### Global normalization

`astro.config.ts` sets `trailingSlash: "always"`. The standalone Node adapter normalizes slashless requests with a hardcoded `301` before repository middleware, including non-GET requests. It cannot generically guarantee method preservation. All repository-owned POST producers therefore call canonical slash endpoints. At the production edge, slashless non-idempotent requests must use `307` or `308` so method and body survive.

### Historical redirects

Move redirect construction into a focused pure module so it can be unit-tested. Define one normalized source per historical URL and always use a slash destination.

Redirect families:

1. RU and EN legacy `/blog/<lesson>/` routes to `/courses/claude-code-guide/<lesson>/`.
2. Legacy root lesson slugs to their RU course lesson canonical.
3. Known concatenated lesson paths to the final lesson represented by the last slug.
4. Removed posts to `/blog/` only when the blog index is the meaningful replacement.
5. `/privacy/` is removed from the redirect map and remains a deliberate `404` because the repository has no policy document to serve.
6. `/terms/`, `/README/`, and `/en/tags/guide/` remain deliberate `404`s; their internal discovery sources are removed and no misleading homepage redirect is added.

The build must contain no duplicate normalized redirect routes. A test compares normalized keys before Astro consumes the map.

An already-slashed legacy alias is one local `301` hop to its final canonical. A slashless legacy alias is two local hops because adapter normalization runs first. The production edge must recognize slashless legacy aliases and redirect directly to the final canonical in one hop.

### File-like slash variants

No repository producer emits a trailing slash for file-like identities. Astro's standalone static handler runs before middleware: in the verified adapter build, `/llms-full.txt/` returns a duplicate `200`, while `/rss.xml/`, `/feed.json/`, `/sitemap-index.xml/`, and `/sitemap-ru.xml/` return `500`, for both GET and HEAD. Middleware or an Astro catch-all cannot intercept these requests without a custom server or adapter patch, which is disproportionate and explicitly out of scope. The production edge must issue one direct `301` from every such variant to the unslashed file canonical; the runbook verifies both GET and HEAD.

### `www` host

Source code will document the required edge rule:

- valid certificate covering `www.artka.dev`;
- `301 https://www.artka.dev/* -> https://artka.dev/$1`;
- equivalent HTTP-to-HTTPS behavior.

Application-level host normalization redirects a trusted `Host`/`X-Forwarded-Host` value of `www.artka.dev` to the HTTPS apex as defense in depth. It cannot solve TLS negotiation and is not counted as completion of the external fix.

The standalone Node adapter serves prerendered files before Astro middleware. The application-level redirect therefore protects on-demand routes only; converting public prerendered pages to SSR solely for host normalization would be a disproportionate performance and architecture change and would not represent edge/CDN static delivery. The DNS/proxy one-hop redirect is mandatory for sitewide coverage, including `/about/?x=1`, and remains a post-deploy runbook acceptance check.

The same adapter boundary means Astro middleware security headers wrap on-demand responses but not prerendered static responses. If those headers are intended sitewide, the production edge must attach the equivalent policy to static responses and the owner must verify representative static and on-demand URLs after deployment. This PR does not configure the external edge.

## Indexable inventory policy

### Tag pages

Individual tag archives are indexable only when the locale has at least two published, list-visible posts for that tag. Archives below the threshold receive `noindex,follow` and are excluded from that locale’s sitemap.

The tag index itself remains indexable because it is a navigation hub. The threshold is a named constant shared by tag pages and sitemap generation so the two cannot drift.

### Utility pages

- `/search/`, `/en/search/`, and `/login/`: `noindex,follow`.
- Remove these paths from robots.txt so Google can fetch and process `noindex`.
- Remove the WebSite `SearchAction`; the site must not advertise a search URL it does not want indexed.
- `/llms-full.txt`: return `X-Robots-Tag: noindex`.
- Admin and API routes remain blocked by robots and protected by authentication.

## Sitemap design

- Keep one submitted sitemap index at `/sitemap-index.xml`.
- Locale sitemaps include home, blog, projects index and details, indexable landing pages, published posts, courses, lessons, tag index, and only tag archives meeting the indexability threshold.
- Project details are generated from the `projects` collection rather than a hand-maintained list.
- Child sitemap `lastmod` values reflect the latest real content modification represented by each child sitemap. They do not change merely because a build ran.
- Every sitemap URL is canonical, indexable, returns `200`, and appears exactly once.
- Remove obsolete test expectations for `sitemap-0.xml` and test the actual sitemap index/children.

## On-page and language corrections

- Add one visible H1 to RU/EN About, Uses, and Now pages without changing their visual hierarchy.
- Translate the English frontmatter for `claude-md-12-rules`; the body is already English.
- Localize `/en/search/` title, description, H1, labels, empty state, and form action (`/en/search/`).
- Metadata-length findings are treated as editorial diagnostics, not a bulk string-padding exercise. Tests enforce presence, uniqueness across locale counterparts, and language correctness for known pages, not arbitrary character counts.

## Media and build hygiene

- Cover images receive intrinsic width/height when the dimensions are known; the shared cover component is the preferred fix point.
- Markdown content images below the first meaningful viewport are lazy-loaded; above-the-fold/hero images remain eager.
- Fix the invalid attribute-selector form in the view-transition CSS.
- Import `buildLandingNodes` directly from its defining module to remove the Rollup cross-chunk cycle.
- Keep unrelated TypeScript deprecation hints out of this project because they are not indexing defects.

## Anonymous public-route resilience

The authentication middleware initializes `locals` for every request but calls Better Auth only when authentication context may exist:

- admin, login, auth API, and Astro action requests; or
- requests carrying the Better Auth session cookie.

Anonymous public GET requests without an auth cookie do not initialize Better Auth. This allows health checks and public pages to render when auth secrets are absent in a local smoke environment while preserving fail-loud behavior for authentication flows.

Tests verify both paths: anonymous public rendering succeeds without a secret, while an auth-dependent request still reports missing configuration.

## Testing strategy

Every behavior change follows red-green-refactor.

### Unit tests

- URL path and absolute URL normalization.
- Redirect map uniqueness, target canonicality, and known legacy mappings.
- Tag threshold/indexability agreement.
- Project detail sitemap coverage.
- SearchAction removal and utility-page noindex policy.
- Counterpart/hreflang behavior for routes without translations.
- Anonymous auth middleware routing decision.

### Generated-output tests

- Build succeeds without route collisions or targeted Rollup/CSS warnings.
- Every public internal link obeys the slash policy.
- Canonical, hreflang, OG, JSON-LD identity, sitemap, and feed identity URLs are absolute apex HTTPS values without queries; file-like identities skip only trailing-slash enforcement. Ordinary external content links remain allowed.
- Every internal link in every generated RU/EN lesson resolves to a generated canonical route or an intentional redirect destination.
- Every intended indexable HTML route appears in exactly one sitemap.
- Every sitemap URL maps to generated or on-demand output and is not noindex.
- H1 and locale checks for the affected landing/article pages.

### Production-server smoke tests

Start `dist/server/entry.mjs` with `PORT=0`, parse the adapter-selected listening origin with bounded output polling, mask external service credentials, and assert:

- `/blog` -> one `301` to `/blog/`.
- `/blog/` -> `200` with slash canonical.
- an already-slashed legacy lesson URL resolves in one `301`; a slashless legacy request is truthfully two local `301` hops.
- file endpoints do not gain a slash.
- file-like slash variants retain exact adapter diagnostics so the edge limitation is not hidden.
- canonical `/api/check/` preserves POST method/body, and canonical auth POST paths are not normalization redirects.
- anonymous `/`, `/blog/`, `/en/`, and `/en/blog/` respond without an auth cookie.

### CI order

CI installs Playwright Chromium and OS dependencies, runs `pnpm verify:seo-build` (whose build forces a content-cache refresh), runs unit tests against that fresh `dist`, then explicitly runs the production smoke and SEO utility-route integration suites before translation drift, typecheck, and lint checks.

## Delivery sequence

1. URL policy and production redirect behavior.
2. Historical redirect cleanup and malformed-link prevention.
3. Internal links, canonical/hreflang/schema/RSS convergence.
4. Sitemap and tag indexability convergence.
5. Utility pages, language, H1, and media corrections.
6. Middleware resilience and build-warning cleanup.
7. Whole-site generated-output audit and live-like server verification.
8. External DNS/TLS and Search Console runbook.

Each sequence item is independently tested and reviewed before the next begins.

## External handoff after merge and deployment

Use the owner-gated [Google Indexing Recovery Runbook](../../runbooks/google-indexing-recovery.md) for commands, expected statuses, Search Console steps, and weekly tracking. DNS/TLS, deployment, and Search Console mutations are not completed by this PR.

1. Configure valid TLS and apex redirect for `www.artka.dev` at the DNS/proxy provider.
2. Deploy the verified application build.
3. Confirm live one-hop GET redirects, method-preserving non-GET redirects, direct file-variant/legacy edge redirects, sitemap coverage, robots/noindex behavior, and representative canonicals.
4. In Search Console, submit `/sitemap-index.xml` and remove the obsolete `/sitemap.xml` submission.
5. Inspect/request indexing for a small representative canonical set.
6. Start validation for the 404, redirect, alternate-canonical, and duplicate-canonical buckets.
7. Recheck coverage weekly for 4–8 weeks; indexing growth is an observed outcome, not an immediate deployment assertion.

## Risks and mitigations

- **Redirect loops:** pure normalization tests plus production-server smoke tests.
- **Adapter changes method or mishandles file variants before middleware:** canonical repository clients plus explicit edge acceptance checks for `307`/`308` non-GET and direct `301` file variants.
- **Lost course links:** explicit legacy mappings and generated link audit.
- **Tag pages accidentally submitted while noindex:** one shared threshold function and sitemap/page parity test.
- **Authenticated public experience regresses:** cookie-present and cookie-absent middleware tests.
- **Host redirect appears fixed while TLS is still broken:** external TLS check remains a separate acceptance item.
- **Google retains historical exclusions:** distinguish live verification from Search Console’s delayed state and wait for recrawl.
