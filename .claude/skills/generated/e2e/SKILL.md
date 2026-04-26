---
name: e2e
description: "Skill for the E2e area of astro-blog. 3 symbols across 1 files."
---

# E2e

3 symbols | 1 files | Cohesion: 100%

## When to Use

- Working with code in `tests/`
- Understanding how globalSetup work
- Modifying e2e-related functionality

## Key Files

| File                        | Symbols                                               |
| --------------------------- | ----------------------------------------------------- |
| `tests/e2e/global-setup.ts` | ensurePagefindArtifacts, lstatExistsSafe, globalSetup |

## Entry Points

Start here when exploring this area:

- **`globalSetup`** (Function) — `tests/e2e/global-setup.ts:41`

## Key Symbols

| Symbol                    | Type     | File                        | Line |
| ------------------------- | -------- | --------------------------- | ---- |
| `globalSetup`             | Function | `tests/e2e/global-setup.ts` | 41   |
| `ensurePagefindArtifacts` | Function | `tests/e2e/global-setup.ts` | 17   |
| `lstatExistsSafe`         | Function | `tests/e2e/global-setup.ts` | 29   |

## Execution Flows

| Flow                            | Type            | Steps |
| ------------------------------- | --------------- | ----- |
| `GlobalSetup → LstatExistsSafe` | intra_community | 3     |

## How to Explore

1. `gitnexus_context({name: "globalSetup"})` — see callers and callees
2. `gitnexus_query({query: "e2e"})` — find related execution flows
3. Read key files listed above for implementation details
