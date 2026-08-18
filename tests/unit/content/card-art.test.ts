import { describe, expect, it } from "vitest";
import {
  assignArtVariants,
  hashSeed,
  pickArtVariant,
  SEEDED_VARIANT_COUNT,
} from "~/lib/content/card-art";

// The real corpus at the time of writing — a regression net for the
// Math.imul bug (plain `*` overflowed 2^53 and collapsed most slugs onto
// one variant) and for adjacency handling in grids.
const SLUGS = [
  "claude-md-12-rules",
  "local-coding-agent",
  "json-ld-graph-astro",
  "robots-txt-ai-crawlers-2026",
  "mermaid-svg-playwright-build-time",
  "claude",
] as const;

describe("hashSeed", () => {
  it("is deterministic", () => {
    for (const slug of SLUGS) {
      expect(hashSeed(slug)).toBe(hashSeed(slug));
    }
  });

  it("returns an unsigned 32-bit integer", () => {
    for (const slug of SLUGS) {
      const h = hashSeed(slug);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("spreads synthetic slugs across every variant bucket", () => {
    const buckets = new Set<number>();
    for (let i = 0; i < 200; i++) {
      buckets.add(hashSeed(`post-slug-${i}`) % SEEDED_VARIANT_COUNT);
    }
    expect(buckets.size).toBe(SEEDED_VARIANT_COUNT);
  });
});

describe("pickArtVariant", () => {
  it("stays inside the seeded pool 1..N (variant 0 is featured-only)", () => {
    for (const slug of SLUGS) {
      const v = pickArtVariant(slug);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(SEEDED_VARIANT_COUNT);
    }
  });
});

describe("assignArtVariants", () => {
  it("never repeats a variant within a sliding window of 3 (covers 2-3 col rows)", () => {
    const variants = assignArtVariants([...SLUGS]);
    for (let i = 0; i < variants.length; i++) {
      if (i >= 1) expect(variants[i]).not.toBe(variants[i - 1]);
      if (i >= 2) expect(variants[i]).not.toBe(variants[i - 2]);
    }
  });

  it("keeps a slug's stable variant when it does not collide", () => {
    const variants = assignArtVariants([...SLUGS]);
    expect(variants[0]).toBe(pickArtVariant(SLUGS[0]));
  });

  it("stays inside the seeded pool even after collision bumps", () => {
    const same = Array.from({ length: 10 }, () => "claude-md-12-rules");
    for (const v of assignArtVariants(same)) {
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(SEEDED_VARIANT_COUNT);
    }
  });
});
