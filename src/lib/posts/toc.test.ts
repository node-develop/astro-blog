import { describe, it, expect } from "vitest";
import type { MarkdownHeading } from "astro";
import { buildTocTree } from "./toc";

function h(depth: number, text: string, slug: string): MarkdownHeading {
  return { depth, text, slug };
}

describe("buildTocTree", () => {
  it("returns empty array for no headings", () => {
    expect(buildTocTree([])).toEqual([]);
  });

  it("drops h1 entries", () => {
    const result = buildTocTree([h(1, "Title", "title"), h(2, "Section", "section")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.depth).toBe(2);
    expect(result[0]?.slug).toBe("section");
  });

  it("drops h4 and deeper entries", () => {
    const result = buildTocTree([h(2, "A", "a"), h(4, "Deep", "deep")]);
    expect(result).toHaveLength(1);
    expect(result[0]?.children).toEqual([]);
  });

  it("nests h3s under the nearest preceding h2", () => {
    const result = buildTocTree([
      h(2, "Section A", "a"),
      h(3, "A.1", "a-1"),
      h(3, "A.2", "a-2"),
      h(2, "Section B", "b"),
      h(3, "B.1", "b-1"),
    ]);
    expect(result).toHaveLength(2);
    expect(result[0]?.slug).toBe("a");
    expect(result[0]?.children.map((c) => c.slug)).toEqual(["a-1", "a-2"]);
    expect(result[1]?.slug).toBe("b");
    expect(result[1]?.children.map((c) => c.slug)).toEqual(["b-1"]);
  });

  it("creates a synthetic parent for orphan h3 before any h2", () => {
    const result = buildTocTree([h(3, "Orphan", "orphan"), h(2, "Real", "real")]);
    expect(result).toHaveLength(2);
    expect(result[0]?.slug).toBe("__intro");
    expect(result[0]?.text).toBe("Introduction");
    expect(result[0]?.children.map((c) => c.slug)).toEqual(["orphan"]);
    expect(result[1]?.slug).toBe("real");
  });
});
