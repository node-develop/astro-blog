import { describe, expect, it } from "vitest";
import { jaccard, pickRelated, type RelatedCandidate } from "~/lib/related";

describe("jaccard", () => {
  it("returns 1 for identical sets", () => {
    expect(jaccard(["a", "b"], ["b", "a"])).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    expect(jaccard(["a", "b"], ["c", "d"])).toBe(0);
  });

  it("returns intersection / union for partial overlap", () => {
    // |{a,b}| ∩ |{a,c,d}| = 1; union = 4 → 0.25
    expect(jaccard(["a", "b"], ["a", "c", "d"])).toBeCloseTo(0.25);
  });

  it("returns 0 when both sets are empty (avoids NaN)", () => {
    expect(jaccard([], [])).toBe(0);
  });

  it("ignores duplicate tags within a single side", () => {
    // {a,b} vs {a} → intersection 1, union 2 → 0.5
    expect(jaccard(["a", "a", "b"], ["a"])).toBe(0.5);
  });
});

describe("pickRelated", () => {
  const ru = (slug: string, tags: string[], date = "2026-04-01"): RelatedCandidate => ({
    slug,
    locale: "ru",
    tags,
    pubDate: new Date(date),
    title: slug,
    description: `${slug} desc`,
  });

  const en = (slug: string, tags: string[], date = "2026-04-01"): RelatedCandidate => ({
    slug,
    locale: "en",
    tags,
    pubDate: new Date(date),
    title: slug,
    description: `${slug} desc`,
  });

  it("returns top-3 by Jaccard score, descending", () => {
    const current = ru("current", ["claude", "skills", "hooks"]);
    const all = [
      current,
      ru("a", ["claude", "skills"]), // 2/3
      ru("b", ["claude"]), // 1/3
      ru("c", ["claude", "hooks", "subagents"]), // 2/4
      ru("d", ["mcp"]), // 0
      ru("e", ["claude", "skills", "hooks"]), // identical → 1.0
    ];
    const out = pickRelated({ current, all, limit: 3 });
    expect(out.map((p) => p.slug)).toEqual(["e", "a", "c"]);
  });

  it("excludes the current post even if tags identical", () => {
    const current = ru("current", ["x"]);
    const all = [current, ru("other", ["x"])];
    const out = pickRelated({ current, all, limit: 3 });
    expect(out.map((p) => p.slug)).toEqual(["other"]);
  });

  it("filters out posts of a different locale", () => {
    const current = ru("ru-cur", ["x", "y"]);
    const all = [
      current,
      en("en-twin", ["x", "y"]), // identical tags but EN — must be excluded
      ru("ru-other", ["x"]),
    ];
    const out = pickRelated({ current, all, limit: 3 });
    expect(out.map((p) => p.slug)).toEqual(["ru-other"]);
  });

  it("breaks ties by pubDate desc (newer wins)", () => {
    const current = ru("c", ["x"]);
    const all = [current, ru("older", ["x"], "2026-01-01"), ru("newer", ["x"], "2026-04-01")];
    const out = pickRelated({ current, all, limit: 3 });
    expect(out.map((p) => p.slug)).toEqual(["newer", "older"]);
  });

  it("returns empty list when current has no tags", () => {
    const current = ru("c", []);
    const all = [current, ru("a", ["x"]), ru("b", ["y"])];
    expect(pickRelated({ current, all, limit: 3 })).toEqual([]);
  });

  it("returns empty list when no candidate shares any tag", () => {
    const current = ru("c", ["x"]);
    const all = [current, ru("a", ["y"]), ru("b", ["z"])];
    expect(pickRelated({ current, all, limit: 3 })).toEqual([]);
  });

  it("respects the limit", () => {
    const current = ru("c", ["x"]);
    const all = [current, ru("a", ["x"]), ru("b", ["x"]), ru("c2", ["x"]), ru("d", ["x"])];
    const out = pickRelated({ current, all, limit: 3 });
    expect(out.length).toBe(3);
  });
});
