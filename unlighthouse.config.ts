/**
 * Unlighthouse budget for `pnpm lighthouse:pr` (pull requests only; see scripts/lighthouse-pr.ts).
 * - `throttle: true` is explicit: on localhost Unlighthouse would otherwise run unthrottled.
 * - `ignoreI18nPages: false`: every page declares `x-default` on the canonical origin, not on the
 *   127.0.0.1 server, so with the default `true` every route is dropped from the report.
 * - `maxConcurrency: 1`: parallel Chrome tabs on a small runner make the performance score noisy.
 * Budgets are in percent. A score that is missing from the report passes this budget silently,
 * so scripts/lighthouse-pr.ts also demands a numeric score per category for every URL.
 */
export default {
  ci: { budget: { performance: 85, accessibility: 95, seo: 100 }, reporter: "jsonSimple" },
  scanner: { device: "mobile", throttle: true, samples: 3, ignoreI18nPages: false },
  puppeteerClusterOptions: { maxConcurrency: 1 },
  cache: false,
  outputPath: ".unlighthouse",
};
