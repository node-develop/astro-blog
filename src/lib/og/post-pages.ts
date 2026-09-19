/**
 * Post OG image paths — one source of truth for the `/og/...` URL of an
 * article card, shared by the route that emits the PNG
 * (`src/pages/og/[slug].png.ts`) and the layout that puts it in `<meta>`
 * (`src/layouts/PostLayout.astro`).
 *
 * Why this module exists: the route used to strip the `en/` prefix from the
 * entry id and de-duplicate by bare slug, with RU iterated first. Both
 * locales of a post therefore resolved to ONE image carrying the RU title,
 * and the build said nothing — an EN article was shared with a Russian card.
 *
 * Shape: `/og/<slug>-<locale>.png`, the same `<name>-<locale>` convention
 * `landingOgPath()` already uses. Both locales carry the suffix on purpose:
 * that is what makes the namespace collision-proof. Two different posts can
 * never produce the same file name —
 *   - within one locale the bare slugs would have to be equal, and a slug is
 *     unique inside a locale;
 *   - across locales the same name would have to end in both `-ru` and `-en`.
 * A bare-RU plus suffixed-EN scheme has no such guarantee: an RU post slugged
 * `foo-en` would quietly take over the EN card of `foo`. The route still
 * asserts uniqueness while collecting paths, so a later change to this shape
 * fails the build instead of silently serving the wrong picture.
 */
import type { Locale } from "~/i18n";

/** File-name stem of a post card: `<slug>-<locale>`. */
export const postOgSlug = (slug: string, locale: Locale): string => `${slug}-${locale}`;

/** Public path of a post card. Use as `<BaseLayout ogImage={...}>`. */
export const postOgPath = (slug: string, locale: Locale): string =>
  `/og/${postOgSlug(slug, locale)}.png`;
