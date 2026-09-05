---
name: e2e
description: "Skill for the E2e area of astro-blog. 3 symbols across 1 files."
---

# E2e

3 symbols | 1 files | Cohesion: 100%

## When to Use

Invoke this skill when the task matches one of these patterns:

- **e2e tests fail at startup** complaining about missing pagefind artifacts — owned by `ensurePagefindArtifacts` and `lstatExistsSafe`.
- **Changing the global pre-Playwright setup** — DB migrations, preview-server startup, fixtures. Edits land in `globalSetup`.
- **Adding a new pre-flight step** before e2e (cache warmup, seed data) — extend `globalSetup`.

**Do NOT invoke** for writing the tests themselves (that's `frontender`/`backender` plus Playwright docs), for unit tests (Vitest, not e2e), or for production builds.

## Key Files

| File                        | Symbols                                               |
| --------------------------- | ----------------------------------------------------- |
| `tests/e2e/global-setup.ts` | ensurePagefindArtifacts, lstatExistsSafe, globalSetup |

## Entry Points

Start here when exploring this area:

- **`globalSetup`** (Function) — `tests/e2e/global-setup.ts`

## Key Symbols

Line numbers are omitted on purpose — they go stale; locate symbols with Grep or `gitnexus_context`. `installFixtures` / `removeFixtures` (same file) manage the `e2e-*` content fixtures that `pnpm translate` and the translation guard skip.

| Symbol                    | Type     | File                        |
| ------------------------- | -------- | --------------------------- |
| `globalSetup`             | Function | `tests/e2e/global-setup.ts` |
| `ensurePagefindArtifacts` | Function | `tests/e2e/global-setup.ts` |
| `lstatExistsSafe`         | Function | `tests/e2e/global-setup.ts` |
| `installFixtures`         | Function | `tests/e2e/global-setup.ts` |
| `removeFixtures`          | Function | `tests/e2e/global-setup.ts` |

## Execution Flows

| Flow                            | Type            | Steps |
| ------------------------------- | --------------- | ----- |
| `GlobalSetup → LstatExistsSafe` | intra_community | 3     |

## How to Explore

1. `gitnexus_context({name: "globalSetup"})` — see callers and callees
2. `gitnexus_query({query: "e2e"})` — find related execution flows
3. Read key files listed above for implementation details
