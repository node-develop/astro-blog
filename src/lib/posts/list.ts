import { getCollection, type CollectionEntry } from "astro:content";

export type PostEntry = CollectionEntry<"posts">;

/**
 * Parses a leading numeric prefix from a slug (e.g. "02-context-and-cache" → 2).
 * Returns `null` when absent — caller decides the fallback sort key.
 */
export function parseSlugOrder(slug: string): number | null {
  const match = /^(\d+)[-_]/.exec(slug);
  if (!match || match[1] === undefined) return null;
  const n = Number.parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * Returns published (non-draft) posts, sorted so that:
 *  - posts whose slug starts with a numeric prefix come first, ordered ascending
 *    by that number (matches guide-series ordering like "01-", "02-", …);
 *  - remaining posts follow, ordered by pubDate descending.
 *
 * This is a pure transform over `getCollection("posts")` and can be reused by
 * the sidebar, the blog index, and the RSS feed without each reimplementing
 * sort semantics.
 */
export async function getPublishedPosts(): Promise<readonly PostEntry[]> {
  const posts = await getCollection("posts", (entry: PostEntry) => !entry.data.draft);
  return [...posts].sort(comparePosts);
}

export function comparePosts(a: PostEntry, b: PostEntry): number {
  const aOrder = parseSlugOrder(a.id);
  const bOrder = parseSlugOrder(b.id);
  if (aOrder !== null && bOrder !== null) return aOrder - bOrder;
  if (aOrder !== null) return -1;
  if (bOrder !== null) return 1;
  return b.data.pubDate.getTime() - a.data.pubDate.getTime();
}
