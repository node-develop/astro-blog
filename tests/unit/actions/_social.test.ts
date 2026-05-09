import { describe, it, expect } from "vitest";
import { computeSourceHash } from "~/actions/_social";

describe("computeSourceHash", () => {
  it("is deterministic", () => {
    const a = { title: "T", body: "B", frontmatter: { x: 1 } };
    expect(computeSourceHash(a)).toBe(computeSourceHash(a));
  });

  it("changes when body changes", () => {
    const a = computeSourceHash({ title: "T", body: "B1", frontmatter: {} });
    const b = computeSourceHash({ title: "T", body: "B2", frontmatter: {} });
    expect(a).not.toBe(b);
  });

  it("changes when title changes", () => {
    const a = computeSourceHash({ title: "T1", body: "B", frontmatter: {} });
    const b = computeSourceHash({ title: "T2", body: "B", frontmatter: {} });
    expect(a).not.toBe(b);
  });

  it("changes when frontmatter changes", () => {
    const a = computeSourceHash({ title: "T", body: "B", frontmatter: { tags: ["a"] } });
    const b = computeSourceHash({ title: "T", body: "B", frontmatter: { tags: ["b"] } });
    expect(a).not.toBe(b);
  });

  it("returns hex string of length 64", () => {
    const h = computeSourceHash({ title: "T", body: "B", frontmatter: {} });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
