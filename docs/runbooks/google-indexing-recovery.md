# Google Indexing Recovery Runbook

Owner: site owner / DNS, proxy, deployment, and Google Search Console administrators
Repository prerequisite: merge and deploy the Google indexing recovery changes after CI passes
Status: owner-gated; external mutations in this runbook are **not completed by the PR**

Record the operator, UTC timestamp, deployed commit, command output, and Search Console screenshots or export links alongside every completed checkbox. Stop if a redirect takes more than one hop, changes the path/query, returns a temporary status, or points away from `https://artka.dev`.

Astro middleware supplies a defense-in-depth host redirect for on-demand routes. The standalone adapter and production edges serve prerendered files before that middleware, so the DNS/proxy rule below is mandatory for sitewide host normalization; do not treat the application fallback as completion of the `www` migration.

## 1. DNS and TLS for `www`

- [ ] At the DNS/proxy provider, confirm `www.artka.dev` resolves only to the intended production edge. Remove stale records only after the owner verifies their purpose.
- [ ] Provision and activate a certificate whose Subject Alternative Names include `www.artka.dev`. This must be valid before relying on an HTTPS redirect; an application response cannot repair a failed TLS handshake.
- [ ] Configure both HTTP and HTTPS `www` traffic as one permanent hop to the apex, preserving the complete request URI:

  ```text
  https://www.artka.dev/$request_uri -> https://artka.dev/$request_uri (301)
  http://www.artka.dev/$request_uri  -> https://artka.dev/$request_uri (301)
  ```

- [ ] Verify certificate and redirect behavior from outside the provider network:

  ```bash
  curl -sS -I 'https://www.artka.dev/about/?x=1'
  curl -sS -I 'http://www.artka.dev/about/?x=1'
  ```

  Expected for both: `301` and exactly `Location: https://artka.dev/about/?x=1`. The HTTPS command must complete without certificate warnings.

## 2. Deploy the verified application

- [ ] Confirm CI ran the repository checks, including `pnpm verify:seo-build` and `pnpm test:production-smoke`, on the commit selected for release.
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
  curl -sS -I 'https://artka.dev/blog/02-context-and-cache/'
  ```

  Expected: one `301` directly to `https://artka.dev/courses/claude-code-guide/02-context-and-cache/`.

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
