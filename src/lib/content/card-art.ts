/**
 * Variant picker for CardArt — the decorative artwork on post cards and
 * article headers.
 *
 * Variant 0 is the large featured-slot composition (420×260 viewBox, heavy
 * strokes) and is only ever chosen explicitly. Seeded picks map into the
 * small-card pool [1..SEEDED_VARIANT_COUNT] so a slug never lands on the
 * featured composition, whose stroke weights are off-system at card size.
 */

/** Number of small-card compositions (CardArt variants 1..N). */
export const SEEDED_VARIANT_COUNT = 5;

/**
 * FNV-1a (with Math.imul — a plain `*` overflows 2^53 and corrupts low
 * bits) followed by the murmur3 finalizer for avalanche. Raw FNV-1a low
 * bits cluster badly on short same-alphabet slugs.
 */
export const hashSeed = (seed: string): number => {
  let h = 2166136261;
  for (const ch of seed) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
};

/** Stable small-card variant (1..SEEDED_VARIANT_COUNT) for a post slug. */
export const pickArtVariant = (seed: string): number => 1 + (hashSeed(seed) % SEEDED_VARIANT_COUNT);

/**
 * Variants for a whole grid of cards. Starts from each slug's stable
 * `pickArtVariant`, then bumps deterministically past the two previous
 * picks, so no two neighbours (covering rows up to 3 columns) share a
 * composition even when their hashes collide. A slug keeps its stable
 * variant unless it collides in that particular list.
 */
export const assignArtVariants = (seeds: ReadonlyArray<string>): number[] => {
  const out: number[] = [];
  for (const seed of seeds) {
    let v = pickArtVariant(seed);
    const recent = out.slice(-2);
    while (recent.includes(v)) {
      v = 1 + (v % SEEDED_VARIANT_COUNT);
    }
    out.push(v);
  }
  return out;
};
