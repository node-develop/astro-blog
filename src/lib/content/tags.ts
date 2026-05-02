import type { PostWithMeta } from "./loader";
import type { Locale } from "~/i18n";

/**
 * Indexes posts by tag slug, preserving the caller-supplied iteration order
 * inside each tag bucket. The caller is expected to pass `getOrderedPosts`
 * output, so this function never sorts: the bucket order matches blog index
 * order (pinned first, then `order` ascending).
 *
 * Pure: never mutates inputs; safe to run in component frontmatter / SSG.
 */
export const groupPostsByTag = (
  posts: ReadonlyArray<PostWithMeta>,
): ReadonlyMap<string, ReadonlyArray<PostWithMeta>> => {
  const out = new Map<string, PostWithMeta[]>();
  for (const post of posts) {
    for (const tag of post.entry.data.tags) {
      const bucket = out.get(tag);
      if (bucket) bucket.push(post);
      else out.set(tag, [post]);
    }
  }
  return out as ReadonlyMap<string, ReadonlyArray<PostWithMeta>>;
};

/**
 * Returns sorted unique tag slugs across BOTH locale collections. Used by the
 * /tags index page (D1) and by `getStaticPaths` for /tags/[tag] (D2). We
 * enumerate both locales because tag slugs are language-neutral identifiers —
 * a slug present only in one locale must still produce a route in the other
 * (the empty-list page explains this to the visitor).
 */
export const getAllTagSlugs = (input: {
  readonly ru: ReadonlyArray<PostWithMeta>;
  readonly en: ReadonlyArray<PostWithMeta>;
}): ReadonlyArray<string> => {
  const slugs = new Set<string>();
  for (const p of input.ru) for (const t of p.entry.data.tags) slugs.add(t);
  for (const p of input.en) for (const t of p.entry.data.tags) slugs.add(t);
  return [...slugs].sort();
};

/**
 * Resolves a tag slug to its human-readable label using the i18n dict. Falls
 * back to the slug itself when missing — this is intentional: it surfaces
 * "label needs to be added to tags.{ru,en}.json" without breaking links.
 *
 * `locale` is part of the signature even though it isn't used directly in the
 * lookup (the dict is locale-specific and supplied by the caller). It exists
 * so callers don't have to thread which dict they passed; future enhancements
 * (e.g. fallback chain ru→en) can use it without changing call sites.
 */
export const resolveTagLabel = (
  slug: string,
  _locale: Locale,
  dict: Readonly<Record<string, string>>,
): string => dict[slug] ?? slug;
