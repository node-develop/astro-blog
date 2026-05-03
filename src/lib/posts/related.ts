/**
 * related — Jaccard similarity over tags, tie-break by recency.
 *
 * Reuses `getOrderedPosts` from the existing content loader so it
 * respects locale routing, draft filtering, and series exclusion the
 * same way the rest of the site does.
 */
import { getOrderedPosts, type PostWithMeta } from "~/lib/content/loader";
import type { Locale } from "~/i18n";

const bareSlug = (id: string): string => id.replace(/^en\//, "");

export interface RelatedPost {
  readonly slug: string;
  readonly title: string;
  readonly pubDate: Date;
  readonly tags: readonly string[];
  readonly score: number;
}

interface RelatedOptions {
  readonly slug: string;
  readonly locale: Locale;
  readonly limit?: number;
}

const jaccard = (a: readonly string[], b: readonly string[]): number => {
  if (a.length === 0 || b.length === 0) return 0;
  const A = new Set(a);
  const B = new Set(b);
  let intersect = 0;
  for (const x of A) if (B.has(x)) intersect++;
  const union = A.size + B.size - intersect;
  return union === 0 ? 0 : intersect / union;
};

export const getRelatedPosts = async ({
  slug,
  locale,
  limit = 3,
}: RelatedOptions): Promise<readonly RelatedPost[]> => {
  const all = await getOrderedPosts({ locale });
  const current = all.find((p) => bareSlug(p.entry.id) === slug);
  if (!current) return [];

  const currentTags = (current.entry.data.tags ?? []) as readonly string[];
  if (currentTags.length === 0) return [];

  const scored = all
    .filter((p) => bareSlug(p.entry.id) !== slug)
    .map((p: PostWithMeta) => {
      const tags = (p.entry.data.tags ?? []) as readonly string[];
      const score = jaccard(currentTags, tags);
      return {
        slug: bareSlug(p.entry.id),
        title: p.entry.data.title,
        pubDate: p.entry.data.pubDate,
        tags,
        score,
      };
    })
    .filter((p) => p.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.pubDate.getTime() - a.pubDate.getTime();
    })
    .slice(0, limit);

  return scored;
};
