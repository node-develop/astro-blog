# Test suite optimization (2026-09-24)

## Problem

Baseline before the change: 187 test files, ~16k lines. `vitest run --exclude tests/integration/**` —
146 files / 1252 tests / ~22 s. CI invokes Vitest 5 separate times, typecheck and lint run last
(after the ~3 min build), e2e never runs in CI.

Findings:

1. **Source-grep tests** (~40 files). `readFileSync("src/pages/uses.astro")` + `toMatch(/buildLandingNodes/)`,
   CI-yaml step ordering, `astro.config` literals, import graphs. They fail on refactors that keep behaviour
   and pass on regressions that keep the text — change-detector tests (Google TotT, 2015).
2. **Tests of things TS / Zod / `astro build` / `translate:check` already enforce**: length limits restated
   from `limits.ts`, fixture length checks in 8 near-identical social writer/editor files, `1 + 1 = 2`,
   sha256 format, config constants.
3. **"Unit" tests that need a built `dist/`** (15 files): some `skipIf` silently without a build, some crash
   with a raw ENOENT, four boot the production server, two launch Chromium. `.husky/pre-push` runs `pnpm test`
   *before* `pnpm build`, i.e. against the previous build.
4. **CI**: 5 Vitest invocations with hand-synced `--exclude` lists; no fail-fast order; no `concurrency`;
   no timeout on `validate`; copy-pasted setup; `tests/unit/ci-workflow.test.ts` locks all of that in.
5. **Harness** pushes towards noise: `backender` checklist says "unit test for every new function",
   `critic` flags "new logic without unit tests", nothing tells the agent what *not* to test.

## Target shape (testing trophy, Vitest `projects`)

| Project | Location                                                 | Needs                          | Runs in CI job |
| ------- | -------------------------------------------------------- | ------------------------------ | -------------- |
| `unit`  | `tests/unit/**`, `src/**/*.test.ts`, `scripts/**`        | nothing                        | `checks`       |
| `built` | `tests/built/**`                                         | `dist/` (fails loudly without) | `build`        |
| `db`    | `tests/integration/**`                                   | Docker (Testcontainers)        | `db`           |
| e2e     | `tests/e2e/**` (Playwright, local)                       | dev server + DB                | —              |

Scripts: `pnpm test` = unit, `pnpm test:built`, `pnpm test:db`, `pnpm test:all`.

## Steps

1. **Delete** source-grep / tautological files (list in the commit), and dead e2e specs
   (`seo.spec`, `search-page`, `admin-create`, `admin-reorder`, `admin-search`, `mobile-toc`, `social-flow*`).
2. **Consolidate**: 8 social writer/editor files + 10 JSON fixtures → one table-driven
   `llm-adapters.test.ts`; `errors` → `retry`; `site.update` → `site-io`; `translate.summary-faq` →
   `frontmatter`; `about/now/uses-content` → one `site-links.test.ts`.
3. **Trim** individual `it` blocks that restate constants/limits or grep source (per-file list in the commit).
4. **Move** dist-dependent files to `tests/built/`, `production-server.helpers.ts` to `tests/support/`;
   a `globalSetup` fails the `built` project when `dist/` is missing; drop the `skipIf(!dist)` escapes.
5. **CI**: composite setup action; jobs `checks` (lint → typecheck → translate:check → unit, fail-fast),
   `build` (Chromium headless shell → `verify:seo-build` → `test:built`), `db` (`test:db`);
   `concurrency` + `cancel-in-progress` on PRs, `timeout-minutes` everywhere, `permissions: contents: read`.
6. **Git hooks**: pre-commit = `.env` guard + lint-staged (no full typecheck on every commit);
   pre-push = lint + typecheck + translate:check + unit (build / built / db stay in CI).
7. **Harness**: testing policy in `CLAUDE.md`; `write-tests` skill with the decision checklist;
   `backender` / `frontender` / `critic` aligned with it; `test-guard.sh` PreToolUse hook blocks test files
   that read `.astro` / workflow / config source to regex it.

## Out of scope (flagged, not done here)

- Folding `seo-utility-routes` / `course-dates` / `home-brand-metadata` into the smoke file so the
  `built` project boots the standalone server once (a `globalSetup` that `provide()`s the origin).
- Merging the three `socialDrafts.*` integration files (would save 2 Postgres boots) — cannot be run in
  this environment (no Docker); do it together with a shared Testcontainers `globalSetup`.
- Source refactors suggested by the audit: one `hasSessionCookie` for `request-classification` and
  `public-cache`; `mapHttpFailure` shared by the social clients; exporting `TITLE_BUDGET` from a lib module.
- Running e2e in CI (needs a Postgres service + started server).
