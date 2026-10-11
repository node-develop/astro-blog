# Research ledger for the offline fixture

This fixture is a local engineering demonstration, not a production article. The sources below were read from the checkout on 2026-10-11. Public GitHub links identify the same modules but are not evidence of a network availability check.

| Claim                                                                  | Source inspected                                                      | Evidence and limits                                                                                                                |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `draft: true` excludes both locales from article routes.               | `src/pages/blog/[...slug].astro`, `src/pages/en/blog/[...slug].astro` | Both `getStaticPaths` functions filter `!entry.data.draft`. Native build is required to verify actual output.                      |
| Hiding a post from lists does not remove its direct route.             | `src/lib/content/loader.ts`, the two article routes above             | List loading filters `hiddenFromList`; route enumeration does not use that loader.                                                 |
| `e2e-` skips translation checking, not route generation.               | `src/lib/translate/sync-check.ts`, article routes                     | `isFixtureSlug` checks the prefix; route filters only draft/locale.                                                                |
| Translation hash includes body plus translated fields, not dates/tags. | `src/lib/translate/hash.ts`, `src/lib/translate/fields.ts`            | `contentHash` normalizes the body and hashes sorted collected string fields. Tests must exercise changed body versus changed tags. |
| Draft-only compilation does not inspect a rendered post page.          | Article routes and Astro build output                                 | Route omission prevents testing PostLayout for that draft. Requires a separate local preview.                                      |

No author experience, measurements, SEO outcomes, or third-party facts were invented. The code sample is explicitly a fragment with `ruRaw` supplied by its caller. No model API, article upload, or publication is required.
