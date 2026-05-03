/**
 * prev-next — resolve neighbouring posts for a given slug.
 *
 * Logic:
 *   - If the slug starts with NN- (series convention), neighbours are the
 *     adjacent series posts ordered by `meta.order`.
 *   - Otherwise, neighbours are the adjacent non-series posts ordered
 *     reverse-chronologically by pubDate.
 *
 * Cross-bucket fallback: when a series post has no series-neighbour on one
 * side (e.g. it's the first one), no link is rendered on that side.
 */
import { getOrderedPosts, type PostWithMeta } from "~/lib/content/loader";
import type { Locale } from "~/i18n";

const SERIES_RX = /^\d{2}[-_]/;

const bareSlug = (id: string): string => id.replace(/^en\//, "");
const isSeries = (id: string): boolean => SERIES_RX.test(bareSlug(id));

export interface NeighbourPost {
  readonly slug: string;
  readonly title: string;
}

const toNeighbour = (p: PostWithMeta): NeighbourPost => ({
  slug: bareSlug(p.entry.id),
  title: p.entry.data.title,
});

export interface PrevNextResult {
  readonly prev: NeighbourPost | null;
  readonly next: NeighbourPost | null;
}

export interface PrevNextOptions {
  readonly slug: string;
  readonly locale: Locale;
}

export const getPrevNext = async ({ slug, locale }: PrevNextOptions): Promise<PrevNextResult> => {
  const all = await getOrderedPosts({ locale });

  const targetIsSeries = SERIES_RX.test(slug);

  if (targetIsSeries) {
    const series = all.filter((p) => isSeries(p.entry.id));
    const idx = series.findIndex((p) => bareSlug(p.entry.id) === slug);
    if (idx === -1) return { prev: null, next: null };
    return {
      prev: idx > 0 ? toNeighbour(series[idx - 1]!) : null,
      next: idx < series.length - 1 ? toNeighbour(series[idx + 1]!) : null,
    };
  }

  // Non-series: order by pubDate desc, locate, neighbour = +/-1.
  const others = all
    .filter((p) => !isSeries(p.entry.id))
    .slice()
    .sort((a, b) => b.entry.data.pubDate.getTime() - a.entry.data.pubDate.getTime());
  const idx = others.findIndex((p) => bareSlug(p.entry.id) === slug);
  if (idx === -1) return { prev: null, next: null };
  return {
    // "prev" = older post (higher index in desc array)
    prev: idx < others.length - 1 ? toNeighbour(others[idx + 1]!) : null,
    // "next" = newer post (lower index)
    next: idx > 0 ? toNeighbour(others[idx - 1]!) : null,
  };
};
