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

export interface PostCover {
  /** Site path or absolute URL of the cover as stored; null when the post has none. */
  readonly url: string | null;
  /** False for no cover and for the site-wide /og-default.* placeholder. */
  readonly isReal: boolean;
}

/**
 * Normalises frontmatter `cover`. It is stored as a path relative to
 * /uploads/ (e.g. "2026/04/file.png"); site paths and absolute URLs are
 * accepted as they are. The /og-default.* placeholder is not a real cover.
 */
export const resolvePostCover = (cover: string | null | undefined): PostCover => {
  const url = cover
    ? cover.startsWith("/") || /^https?:\/\//.test(cover)
      ? cover
      : `/uploads/${cover}`
    : null;
  return { url, isReal: url !== null && !/^\/og-default\.(svg|png)$/.test(url) };
};

/**
 * Absolute URL of the image that represents a post outside its own page:
 * BlogPosting.image, feeds, social drafts. A real cover wins; otherwise the
 * per-post /og card, never the generic placeholder (an SVG, and the same
 * picture for every post).
 */
export const postShareImage = (
  cover: string | null | undefined,
  slug: string,
  locale: Locale,
  base: string | URL,
): string => {
  const { url, isReal } = resolvePostCover(cover);
  return new URL(isReal && url !== null ? url : postOgPath(slug, locale), base).toString();
};

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  avif: "image/avif",
  gif: "image/gif",
  svg: "image/svg+xml",
};

/** Media type by file extension; null when the URL does not say. */
export const imageTypeOf = (url: string): string | null => {
  const ext = /\.([a-z0-9]+)$/i.exec(new URL(url, "https://artka.dev").pathname)?.[1];
  return ext ? (IMAGE_TYPES[ext.toLowerCase()] ?? null) : null;
};
