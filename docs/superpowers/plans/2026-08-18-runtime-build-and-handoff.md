# Runtime, Build, and Search Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make anonymous public rendering independent of auth secrets, normalize trusted www requests, eliminate audited build warnings, and provide production-equivalent verification plus an external recovery runbook.

**Architecture:** A pure request classifier decides when middleware may initialize Better Auth and when a trusted forwarded host should redirect. The built standalone Node server is exercised by a hermetic smoke script; build-output assertions and a runbook separate repository completion from DNS/TLS/GSC work.

**Tech Stack:** Astro middleware, Better Auth, Node child processes, Vitest 3, standalone Node adapter, Docker

**Spec:** `docs/superpowers/specs/2026-08-18-google-indexing-recovery-design.md`

## Global Constraints

- Middleware initializes `locals.user` and `locals.session` for every request.
- Anonymous public GET/HEAD without a Better Auth cookie must not access Better Auth or require auth secrets.
- Admin, login, `/api/auth/*`, action/non-idempotent requests, and requests with `better-auth.session_token` or `__Secure-better-auth.session_token` still initialize auth and fail loudly when configuration is absent.
- Only trusted `Host`/`X-Forwarded-Host` equal to `www.artka.dev` redirects to `https://artka.dev` with path and query preserved; source code does not claim to repair TLS negotiation.
- The build must not emit duplicate-route, invalid view-transition selector, or SEO Rollup cycle warnings.
- Production smoke uses `dist/server/entry.mjs` with `PORT=0`, parses the adapter-selected origin with bounded output polling, masks database/service credentials, and always performs verified bounded termination.
- Repository non-GET clients call canonical slash endpoints. Astro standalone truthfully returns `301` before middleware for slashless POST; production edge normalization must use method-preserving `307`/`308`.
- External DNS/TLS, deployment, and Search Console mutations remain owner-gated runbook actions.
- Tests must be written and observed failing before production code changes.
- Before editing any existing function, run GitNexus upstream impact analysis and record the blast radius; warn before any HIGH or CRITICAL edit.
- Before each commit, run `gitnexus_detect_changes` for `/Users/izual/astro-blog-gsc-indexing-audit`.

---

## File structure

- `src/lib/auth/request-classification.ts`: pure auth-context and host-redirect decisions.
- `tests/unit/auth/request-classification.test.ts`: boundary tables including cookie/host cases.
- `tests/integration/production-server.smoke.test.ts`: built-server redirects/public rendering/file endpoints.
- `tests/integration/production-server.helpers.ts`: shared hermetic environment, bounded fetch/startup, and TERM-to-KILL lifecycle.
- `scripts/verify-seo-build.ts`: runs the build, captures output, rejects targeted warnings.
- `docs/runbooks/google-indexing-recovery.md`: deploy/TLS/GSC operations checklist.
- `.github/workflows/ci.yml`: installs Chromium, produces fresh `dist`, and runs unit plus explicit runtime suites in order.

### Task 1: Auth-safe middleware, host defense, clean build, and production smoke

**Files:**
- Create: `src/lib/auth/request-classification.ts`
- Create: `tests/unit/auth/request-classification.test.ts`
- Modify: `src/middleware.ts`
- Modify: `src/styles/global.css`
- Modify: `src/pages/about.astro`
- Modify: `src/pages/en/about.astro`
- Modify: `src/pages/now.astro`
- Modify: `src/pages/en/now.astro`
- Modify: `src/pages/uses.astro`
- Modify: `src/pages/en/uses.astro`
- Create: `tests/integration/production-server.smoke.test.ts`
- Create: `scripts/verify-seo-build.ts`
- Create: `scripts/verify-seo-build.test.ts`
- Modify: `package.json`
- Create: `docs/runbooks/google-indexing-recovery.md`
- Modify: `docs/superpowers/specs/2026-08-18-google-indexing-recovery-design.md`

**Interfaces:**
- Produces: `requiresAuthContext(request: Request, pathname: string): boolean`
- Produces: `canonicalHostRedirect(request: Request): URL | null`
- Produces: script command `pnpm verify:seo-build`
- Produces: script command `pnpm test:production-smoke`
- Consumes: redirect and canonical behavior delivered by the canonical URL plan.

- [ ] **Step 1: Write failing request-classification tests**

```ts
it.each(["/", "/blog/", "/en/", "/en/blog/", "/sitemap-index.xml"])(
  "skips auth for anonymous public GET %s",
  (pathname) => expect(requiresAuthContext(request(pathname), pathname)).toBe(false),
);

it.each(["/admin/", "/login/", "/api/auth/get-session"])(
  "requires auth context for %s",
  (pathname) => expect(requiresAuthContext(request(pathname), pathname)).toBe(true),
);

it.each(["better-auth.session_token=x", "__Secure-better-auth.session_token=x"])(
  "requires auth when cookie %s is present",
  (cookie) => expect(requiresAuthContext(request("/", { cookie }), "/")).toBe(true),
);

it("requires auth for a non-idempotent action request", () => {
  expect(requiresAuthContext(request("/_actions/save", { method: "POST" }), "/_actions/save"))
    .toBe(true);
});

it("redirects only trusted www host while preserving path and query", () => {
  expect(canonicalHostRedirect(request("/blog/?q=1", { "x-forwarded-host": "www.artka.dev" }))?.toString())
    .toBe("https://artka.dev/blog/?q=1");
  expect(canonicalHostRedirect(request("/", { "x-forwarded-host": "evil.test" }))).toBeNull();
});
```

- [ ] **Step 2: Run classification tests and capture RED**

Run: `pnpm exec vitest run tests/unit/auth/request-classification.test.ts`

Expected: FAIL because the classifier does not exist.

- [ ] **Step 3: Implement classifiers and update middleware**

`requiresAuthContext` returns true for admin/login/auth API/action paths, any method other than GET/HEAD, or either exact Better Auth session-cookie name. Parse the `Cookie` header by semicolon-delimited cookie name, not substring matching. `canonicalHostRedirect` prefers `X-Forwarded-Host` only when its first comma-delimited value is a syntactically valid host; otherwise uses `Host`. It returns a new apex HTTPS URL only for case-insensitive `www.artka.dev` with an optional port.

In `authContext`, always zero locals, then call `auth.api.getSession` only when `requiresAuthContext` returns true. Add a first middleware that returns `context.redirect(canonicalHostRedirect(...), 301)` for the trusted www case. Preserve middleware order so host normalization happens before auth and security headers still wrap rendered responses.

- [ ] **Step 4: Run classification tests and capture GREEN**

Run: `pnpm exec vitest run tests/unit/auth/request-classification.test.ts`

Expected: all route, cookie, method, and host cases pass.

- [ ] **Step 5: Write failing build-warning parser tests**

```ts
expect(assertSeoBuildOutput("build complete\n")).toEqual([]);
expect(assertSeoBuildOutput("static route cannot be defined more than once"))
  .toContain("duplicate redirect route");
expect(assertSeoBuildOutput("::view-transition-group([transition-name^=x])"))
  .toContain("invalid view-transition selector");
expect(assertSeoBuildOutput("buildLandingNodes is reexported through module"))
  .toContain("SEO chunk cycle");
```

The script must exit nonzero when the returned violation array is non-empty and print the matching warning block.

- [ ] **Step 6: Run parser tests and capture RED**

Run: `pnpm exec vitest run scripts/verify-seo-build.test.ts`

Expected: FAIL because `scripts/verify-seo-build.ts` does not exist.

- [ ] **Step 7: Implement the build verifier and remove warning sources**

Replace the invalid attribute selector around `::view-transition-group` with a valid selector supported by the current browser syntax, or remove only the invalid grouped rule while retaining the base `::view-transition-group(*)` transition. Import `buildLandingNodes` directly from `~/lib/seo/landing` in the six About/Now/Uses routes while continuing to import shared schema types/builders from `~/lib/seo/schema`.

Add:

```json
"verify:seo-build": "tsx scripts/verify-seo-build.ts"
```

The script spawns `pnpm build`, streams output, checks the three exact warning families, and returns the child exit code or 1 for a warning violation.

- [ ] **Step 8: Run build verifier tests and the real verifier**

Run: `pnpm exec vitest run scripts/verify-seo-build.test.ts && pnpm verify:seo-build`

Expected: parser tests pass; real build succeeds without any targeted warning.

- [ ] **Step 9: Write the production-server smoke test and capture RED on baseline behavior**

Spawn `node dist/server/entry.mjs` with `HOST=127.0.0.1`, `PORT=0`, external database/API credentials masked, and `SITE_URL=https://artka.dev`. Parse the adapter's listening origin with bounded output polling, then poll `/robots.txt` with fetch deadlines. Exercise both an unconfigured-auth process and a fixed test-secret process, then assert:

```ts
expect(await status("/")).toBe(200);
expect(await status("/blog/")).toBe(200);
expect(await status("/en/")).toBe(200);
expect(await status("/en/blog/")).toBe(200);
expect(await redirect("/blog")).toEqual({ status: 301, location: "/blog/" });
expect(await redirect("/blog/02-context-and-cache"))
  .toEqual({ status: 301, location: "/blog/02-context-and-cache/" });
expect(await redirect("/blog/02-context-and-cache/"))
  .toEqual({ status: 301, location: "/courses/claude-code-guide/02-context-and-cache/" });
expect(await status("/sitemap-index.xml")).toBe(200);
expect(await status("/privacy/")).toBe(404);
expect(await hostRedirect("/about/?x=1", "www.artka.dev"))
  .toEqual({ status: 301, location: "https://artka.dev/about/?x=1" });
```

Assert live RU/EN on-demand home links use slash canonicals. With configured test auth, prove POST `/api/check/` reaches its handler with method/body and that canonical auth POST routes are not normalization redirects; retain the diagnostic that slashless POST receives adapter-owned `301`. Record exact GET/HEAD file-variant behavior (`/llms-full.txt/` duplicate `200`; static RSS/feed/sitemap variants `500`) because static handling precedes middleware and a custom server/adapter patch is prohibited. Always terminate the child in `finally`; escalate from SIGTERM to SIGKILL after bounded deadlines and include `exitCode`, `signalCode`, and masked server output in diagnostics. Add `"test:production-smoke": "vitest run tests/integration/production-server.smoke.test.ts"`.

Run: `pnpm test:production-smoke`

Expected on the pre-middleware baseline: public SSR requests fail because Better Auth configuration is accessed; after Step 3 and the canonical plan, the assertions pass.

- [ ] **Step 10: Run production smoke and capture GREEN**

Run: `pnpm verify:seo-build && pnpm test:production-smoke`

Expected: public, truthful redirect, canonical POST, file diagnostics, deliberate-404, and trusted-host cases pass; both child processes exit cleanly.

- [ ] **Step 11: Write the external operations runbook**

Create `docs/runbooks/google-indexing-recovery.md` with checked/unchecked commands and expected statuses for:

```text
1. Provision a certificate valid for www.artka.dev at the DNS/proxy owner.
2. Configure one-hop HTTP/HTTPS www -> https://artka.dev/$request_uri (301).
3. Configure `307`/`308` for slashless non-idempotent traffic, direct final redirects for slashless legacy aliases, and direct unslashed file canonicalization for GET/HEAD variants.
4. Deploy this branch after CI's forced-fresh build, unit, production-smoke, and utility-route suites.
5. curl apex/www slash/no-slash, non-GET, legacy, utility/file variants, sitemap, and deliberate-404 representatives.
6. Submit https://artka.dev/sitemap-index.xml in Search Console.
7. Remove the obsolete https://artka.dev/sitemap.xml submission.
8. Inspect/request indexing for home, RU/EN post, course, tag, and project canonical samples.
9. Start validation for 404, redirect, alternate-canonical, and Google-selected-canonical buckets.
10. Record weekly counts for 4–8 weeks; do not promise immediate indexing.
```

Link the runbook from the spec external-handoff section. Explicitly label DNS/TLS, deploy, and GSC mutations as not completed by this PR.

- [ ] **Step 12: Run pre-commit verification and commit**

Run:

```bash
pnpm exec vitest run tests/unit/auth/request-classification.test.ts scripts/verify-seo-build.test.ts
pnpm verify:seo-build
pnpm exec vitest run --exclude 'tests/integration/**'
pnpm test:production-smoke
pnpm exec vitest run tests/integration/seo-utility-routes.test.ts
pnpm translate:check
pnpm typecheck
pnpm lint
```

Then run GitNexus change detection, stage only files in this task, and commit:

```bash
git commit -m "fix: harden public SEO runtime"
```
