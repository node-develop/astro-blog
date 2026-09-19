/**
 * Brand wordmark used on every OG card.
 *
 * Kept in its own leaf module (only `~/lib/seo/url-policy`, which imports
 * nothing) on purpose: `landing-pages.ts` is imported by every landing page,
 * including the SSR-rendered home page. Reading the brand from `og-image.ts`
 * instead would drag `satori` and the native `@resvg/resvg-js` binding into
 * those page bundles, which only the build-time image routes need.
 *
 * Derived from the canonical origin so the wordmark on a card cannot drift
 * from the domain the site is actually served on.
 */
import { CANONICAL_ORIGIN } from "~/lib/seo/url-policy";

export const OG_BRAND = new URL(CANONICAL_ORIGIN).host;
export const OG_BRAND_UPPER = OG_BRAND.toUpperCase();
