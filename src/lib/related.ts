/**
 * Related-posts selection. Pure functions only — no Astro / DB / IO.
 *
 * `pickRelated` ranks candidates by Jaccard similarity of tag sets, filtered
 * to the same locale as the current post, and returns the top-`limit` posts
 * sorted (similarity desc, pubDate desc). Cross-locale leakage is the single
 * biggest correctness risk — covered by an explicit test.
 */

export type Locale = "ru" | "en";

export interface RelatedCandidate {
  readonly slug: string;
  readonly locale: Locale;
  readonly tags: ReadonlyArray<string>;
  readonly pubDate: Date;
  readonly title: string;
  readonly description: string;
}

export interface PickRelatedInput {
  readonly current: RelatedCandidate;
  readonly all: ReadonlyArray<RelatedCandidate>;
  readonly limit: number;
}

/** Jaccard set similarity. Empty/empty returns 0 (avoiding NaN). */
export const jaccard = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): number => {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  let intersection = 0;
  for (const item of setA) if (setB.has(item)) intersection += 1;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

interface Scored {
  readonly candidate: RelatedCandidate;
  readonly score: number;
}

export const pickRelated = (input: PickRelatedInput): ReadonlyArray<RelatedCandidate> => {
  const { current, all, limit } = input;
  if (current.tags.length === 0) return [];

  const scored: Scored[] = [];
  for (const cand of all) {
    if (cand.slug === current.slug) continue;
    if (cand.locale !== current.locale) continue;
    const score = jaccard(current.tags, cand.tags);
    if (score <= 0) continue;
    scored.push({ candidate: cand, score });
  }

  scored.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    return b.candidate.pubDate.getTime() - a.candidate.pubDate.getTime();
  });

  return scored.slice(0, limit).map((s) => s.candidate);
};
