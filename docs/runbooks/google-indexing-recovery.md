# Google Indexing Recovery Runbook

Owner: site owner / DNS, proxy, deployment, and Google Search Console administrators
Repository prerequisite: merge and deploy the Google indexing recovery changes after CI passes
Status: owner-gated; external mutations in this runbook are **not completed by the PR**

Record the operator, UTC timestamp, deployed commit, command output, and Search Console screenshots or export links alongside every completed checkbox. Stop if a redirect takes more than one hop, changes the intended path/query, points away from `https://artka.dev`, uses anything except `301` for GET/HEAD canonicalization, or uses anything except method-preserving `307`/`308` for slashless non-idempotent traffic.

Astro middleware supplies a defense-in-depth host redirect and security headers for on-demand routes. The standalone adapter serves prerendered files before that middleware and hardcodes slash normalization as `301` before middleware for every method. It also serves `/llms-full.txt/` as a duplicate `200` and returns `500` for static RSS/feed/sitemap slash variants. Therefore the DNS/proxy rules below are mandatory for sitewide host normalization, method-preserving non-GET handling, and file-like canonicalization. Prerendered responses also need equivalent security headers configured at the edge if those headers are intended sitewide.

## 1. DNS, TLS, and edge canonicalization

- [ ] At the DNS/proxy provider, confirm `www.artka.dev` resolves only to the intended production edge. Remove stale records only after the owner verifies their purpose.
- [ ] Provision and activate a certificate whose Subject Alternative Names include `www.artka.dev`. This must be valid before relying on an HTTPS redirect; an application response cannot repair a failed TLS handshake.
- [ ] Configure both HTTP and HTTPS `www` traffic as one permanent hop to the apex, preserving the complete request URI:

  ```text
  https://www.artka.dev/$request_uri -> https://artka.dev/$request_uri (301)
  http://www.artka.dev/$request_uri  -> https://artka.dev/$request_uri (301)
  ```

- [ ] If security headers are intended across the entire site, configure the edge to attach the production policy to prerendered responses: `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`, and the intended report-only CSP. Keep the values aligned with `src/middleware.ts` for on-demand responses.

- [ ] Verify certificate and redirect behavior from outside the provider network:

  ```bash
  curl -sS -I 'https://www.artka.dev/about/?x=1'
  curl -sS -I 'http://www.artka.dev/about/?x=1'
  ```

  Expected for both: `301` and exactly `Location: https://artka.dev/about/?x=1`. The HTTPS command must complete without certificate warnings.

- [ ] Configure the edge to use `307` or `308` when a slashless non-idempotent request needs its canonical slash. Do not use `301`/`302`, which may change the method or discard the body.
- [ ] Configure the edge to collapse a slashless legacy alias directly to its final canonical rather than first adding a slash.
- [ ] Configure direct permanent GET/HEAD redirects from file-like slash variants to the unslashed identity, including `/llms-full.txt/`, `/rss.xml/`, `/feed.json/`, `/sitemap-index.xml/`, and locale sitemap variants.

## 2. Deploy the verified application

- [ ] Confirm CI was green on the commit selected for release: job `checks` (`pnpm lint`, `pnpm typecheck`, `pnpm translate:check`, unit tests) and job `build` (Playwright Chromium headless shell, `pnpm verify:seo-build` — which forces an Astro content-cache refresh — then `pnpm test:built`, which includes the production smoke and SEO utility-route suites).
- [ ] Deploy that exact commit through the normal production pipeline. Record the commit SHA and deployment identifier.
- [ ] Confirm the deployment is healthy before changing Search Console submissions. Roll back through the deployment platform if public `200` pages or canonical redirects regress.

## 3. Live HTTP verification

Run these checks against production after caches have refreshed. `curl -I` sends `HEAD`, which follows the same normalization policy as `GET`; use `curl -sS -D - -o /dev/null` as a GET cross-check when a proxy treats HEAD differently.

- [ ] Apex and slash normalization:

  ```bash
  curl -sS -I 'https://artka.dev/'
  curl -sS -I 'https://artka.dev/blog'
  curl -sS -I 'https://artka.dev/blog/'
  curl -sS -I 'https://artka.dev/en/'
  curl -sS -I 'https://artka.dev/en/blog/'
  ```

  Expected: home and slash-suffixed pages return `200`; `/blog` returns one `301` with `Location: /blog/` (or the equivalent absolute apex URL).

- [ ] Historical lesson redirect:

  ```bash
  curl -sS -I 'https://artka.dev/blog/02-context-and-cache'
  curl -sS -I 'https://artka.dev/blog/02-context-and-cache/'
  ```

  Expected for both: one `301` directly to `https://artka.dev/courses/claude-code-guide/02-context-and-cache/`. The local standalone server takes two `301` hops for the slashless form because its normalization precedes the repository redirect; one-hop slashless behavior is therefore an edge-owned production acceptance gate.

- [ ] Method-preserving non-GET slash normalization:

  ```bash
  curl -sS -D - -o /dev/null -X POST -H 'Content-Type: application/json' --data '{' 'https://artka.dev/api/check'
  curl -sS -L --max-redirs 1 -D - -o /dev/null -H 'Content-Type: application/json' --data-binary '{' 'https://artka.dev/api/check'
  curl -sS -D - -o /dev/null -H 'Content-Type: application/json' --data-binary '{' 'https://artka.dev/api/check/'
  curl -sS -D - -o /dev/null -X POST -H 'Content-Type: application/json' --data '{' 'https://artka.dev/api/auth/sign-in/email/'
  curl -sS -D - -o /dev/null -X POST -H 'Content-Type: application/json' --data '{' 'https://artka.dev/api/auth/sign-in/social/'
  curl -sS -D - -o /dev/null -X POST -H 'Content-Type: application/json' --data '{' 'https://artka.dev/api/auth/sign-out/'
  ```

  Expected: the first slashless `/api/check` request returns `307` or `308` to `/api/check/`. The followed probe shows that the same POST body reaches the canonical handler and finishes with deterministic `400` for the intentionally invalid JSON; the direct canonical probe does the same. Canonical auth POST paths may return validation/auth errors, but must not return slash-normalization `301`, `302`, `307`, or `308` and must not expose a normalization `Location` header.

- [ ] Utility and file-like routes:

  ```bash
  curl -sS -I 'https://artka.dev/search/'
  curl -sS -I 'https://artka.dev/en/search/'
  curl -sS -I 'https://artka.dev/llms-full.txt'
  curl -sS -I 'https://artka.dev/robots.txt'
  curl -sS -I 'https://artka.dev/sitemap-index.xml'
  curl -sS -I 'https://artka.dev/sitemap-ru.xml'
  curl -sS -I 'https://artka.dev/sitemap-en.xml'
  ```

  Expected: every route returns `200` without a slash redirect. Search pages render `noindex,follow`; `/llms-full.txt` returns `X-Robots-Tag: noindex`; sitemap responses are XML and list apex HTTPS canonical URLs.

- [ ] File-like slash variants at the edge, using both HEAD and GET:

  ```bash
  curl -sS -I 'https://artka.dev/llms-full.txt/'
  curl -sS -D - -o /dev/null 'https://artka.dev/llms-full.txt/'
  curl -sS -I 'https://artka.dev/rss.xml/'
  curl -sS -D - -o /dev/null 'https://artka.dev/rss.xml/'
  curl -sS -I 'https://artka.dev/feed.json/'
  curl -sS -D - -o /dev/null 'https://artka.dev/feed.json/'
  curl -sS -I 'https://artka.dev/sitemap-index.xml/'
  curl -sS -D - -o /dev/null 'https://artka.dev/sitemap-index.xml/'
  curl -sS -I 'https://artka.dev/sitemap-ru.xml/'
  curl -sS -D - -o /dev/null 'https://artka.dev/sitemap-ru.xml/'
  ```

  Expected: each command returns one `301` directly to the corresponding unslashed apex HTTPS URL. No internal producer emits these variants. Do not accept the standalone adapter's unproxied behavior (`200` duplicate for `/llms-full.txt/`, `500` for the static variants) as production completion.

- [ ] Deliberate removal:

  ```bash
  curl -sS -I 'https://artka.dev/privacy/'
  ```

  Expected: a real `404`, with no redirect to the homepage or blog.

- [ ] Inspect representative page source for one canonical, matching Open Graph URL, language-correct hreflang links, and the expected robots directive:

  ```bash
  curl -sS 'https://artka.dev/blog/json-ld-graph-astro/'
  curl -sS 'https://artka.dev/en/blog/json-ld-graph-astro/'
  curl -sS 'https://artka.dev/tags/astro/'
  curl -sS 'https://artka.dev/projects/astro-blog/'
  ```

- [ ] Compare response security headers on one prerendered page and one on-demand route:

  ```bash
  curl -sS -I 'https://artka.dev/about/'
  curl -sS -I 'https://artka.dev/llms-full.txt'
  ```

  If sitewide headers are part of the deployment policy, both responses must expose the approved `X-Frame-Options`, `Referrer-Policy`, `X-Content-Type-Options`, `Permissions-Policy`, and report-only CSP values. A passing application smoke test alone does not prove headers on edge-served static files.

## 4. Search Console sitemap handoff

These are owner-approved Search Console mutations; do not perform them from a PR workflow.

- [ ] In the verified `https://artka.dev/` property, submit `https://artka.dev/sitemap-index.xml`.
- [ ] Confirm Search Console fetches the index successfully and discovers the RU and EN child sitemaps.
- [ ] Remove the obsolete `https://artka.dev/sitemap.xml` submission. Do not remove the new index or its child sitemaps.
- [ ] Save the submission timestamp and the discovered/submitted URL counts.

## 5. Representative URL inspection and validation

- [ ] Use URL Inspection on this small canonical sample; confirm the inspected URL, user-declared canonical, and rendered canonical agree, then request indexing where the UI permits:

  - Home: `https://artka.dev/`
  - RU post: `https://artka.dev/blog/json-ld-graph-astro/`
  - EN post: `https://artka.dev/en/blog/json-ld-graph-astro/`
  - Course: `https://artka.dev/courses/claude-code-guide/02-context-and-cache/`
  - Tag: `https://artka.dev/tags/astro/`
  - Project: `https://artka.dev/projects/astro-blog/`

- [ ] Start validation for the affected Search Console buckets: Not found (404), Page with redirect, Alternate page with proper canonical, Duplicate without user-selected canonical, and Duplicate where Google chose a different canonical.
- [ ] Record each validation start date and affected-page count. Do not request indexing for `noindex` utilities or deliberate 404s.

## 6. Track recovery for 4–8 weeks

- [ ] Once per week for at least four and up to eight weeks, record:

  | Week/date | Indexed pages | Not found | Redirect | Alternate canonical | Google-selected canonical | Sitemap discovered/indexed | Notes |
  | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |
  | Baseline |  |  |  |  |  |  |  |
  | Week 1 |  |  |  |  |  |  |  |
  | Week 2 |  |  |  |  |  |  |  |
  | Week 3 |  |  |  |  |  |  |  |
  | Week 4 |  |  |  |  |  |  |  |
  | Weeks 5–8, if still changing |  |  |  |  |  |  |  |

- [ ] Investigate new regressions against the live curl checks and deployed SHA before changing source, redirects, DNS, or Search Console again.
- [ ] Close the recovery only after live signals remain stable and Search Console trends are recorded. Deployment does not promise immediate indexing; Google recrawl and canonical selection are observed outcomes.
