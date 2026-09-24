---
name: write-tests
description: Decide whether a change needs a test, which layer it belongs to (unit / built / db / e2e) and how to write it so it fails when behaviour breaks. Use before adding or changing any *.test.ts / *.spec.ts, when a checklist says "add tests", or when reviewing tests in a diff.
---

# Write tests (or decide not to)

Default answer to "should I add a test?" is **no**. Add one only when there is
behaviour that can regress **and** nothing else already catches it. A test that
cannot fail for a real bug is cost: CI minutes, review time, refactor friction.

## 1. Does this need a test at all?

Skip the test when any of these already fails loudly:

| Already enforced by                                                      | So do NOT test                                                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `pnpm typecheck` (TS strict, `astro check`)                              | shapes, required props, "function exists", "returns a string"                        |
| Zod schemas (`content.config.ts`, `src/lib/content/schemas.ts`, actions) | length limits, enums, required fields — re-asserting `max(200)` = copy of the schema |
| `astro build` / `pnpm verify:seo-build`                                  | "page file exists", broken imports, invalid frontmatter, dangling JSON-LD `@id`      |
| `pnpm translate:check`                                                   | RU/EN twin parity, EN frontmatter schema                                             |
| CI itself                                                                | workflow step order, job names, `package.json` scripts                               |

Never write:

- **Source-grep tests** — `readFileSync("src/pages/x.astro")` + `toMatch(/buildLandingNodes/)`, import-graph
  checks, CSS/YAML/config text asserts. Blocked by `.claude/hooks/test-guard.sh`.
- **Constant restatements** — `expect(person.name).toBe("…")`, `expect(CAL_ORIGIN).toBe("…")`.
- **Fixture tautologies** — asserting the length/shape of a fixture you wrote yourself.
- **Mock-was-called-only** tests — assert the result or the request contract, not `toHaveBeenCalled()` alone.
- **Sanity tests** — `1 + 1 === 2`, "vitest runs", "module loads".
- **Tests of test helpers** — unless the helper protects something real (e.g. credential masking).

## 2. Pick the layer (vitest.config.ts `projects`)

| Layer   | Where                                                | Use for                                                                                       | Run                                    |
| ------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| `unit`  | `src/**/x.test.ts` next to the module, `tests/unit/` | pure logic in `src/lib/**`: parsing, URL/SEO policy, routing, security checks, retries        | `pnpm test`                            |
| `built` | `tests/built/`                                       | what the site actually ships: HTML, JSON-LD, meta, sitemaps, served routes                    | `pnpm test:built` (after `pnpm build`) |
| `db`    | `tests/integration/`                                 | Drizzle queries, Actions, locking/idempotency against real Postgres                           | `pnpm test:db` (Docker)                |
| e2e     | `tests/e2e/` (Playwright, local only)                | a few critical user flows: admin post lifecycle, media, ⌘K search, booking, i18n toggle, a11y | `pnpm test:e2e`                        |

- `.astro` markup is tested through its output (`tests/built`), never by reading the template.
- Anything that needs `dist/` goes to `tests/built` — never `skipIf(!existsSync("dist"))` in `unit`.
- A `built` test that needs the running site uses `inject("siteOrigin")` (one shared server from
  `tests/built/global-setup.ts`); start your own server only to assert on startup or logs.
- A new e2e spec needs a user flow that no lower layer can cover. Prefer extending an existing spec.

## 3. Write it so it fails for the right reason

1. Name the regression it guards: one sentence in the `it(...)` title or a comment
   ("EN archive must not point at the RU card"). If you cannot name one — don't write it.
2. Prove it can fail: break the code under test (or revert the fix) and watch the test go red.
   For a bug fix, write the failing test first.
3. Boundaries over happy paths: empty input, limit ±1, malformed/hostile input, locale edge (RU vs EN).
4. Table-driven (`it.each`) instead of copy-pasted files per variant (see `tests/unit/lib/social/llm-adapters.test.ts`).
5. Mock only the boundary (network, LLM SDK, clock). No mocks for our own pure functions.
6. Extend the nearest existing test file for the same module before creating a new one.

## 4. Reviewing tests in a diff

Flag as **Important**: source-grep, constant restatement, duplicated coverage, `skipIf` on missing
build, a test in the wrong layer. Flag a missing test only when you can name the concrete regression
it would catch and no layer above already catches it.
