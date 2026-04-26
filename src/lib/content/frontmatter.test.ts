import { describe, it, expect } from "vitest";
import { parseFrontmatter, serializeFrontmatter, type Frontmatter } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("parses YAML block at top of file", () => {
    const raw = [
      "---",
      'title: "Hello"',
      'description: "A test"',
      "pubDate: 2026-01-01",
      "tags: [a, b]",
      "draft: false",
      "---",
      "",
      "Body text",
    ].join("\n");
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.title).toBe("Hello");
    expect(frontmatter.tags).toEqual(["a", "b"]);
    expect(body).toBe("Body text");
  });

  it("throws when frontmatter block is missing", () => {
    expect(() => parseFrontmatter("no frontmatter here")).toThrow(/frontmatter/i);
  });

  it("preserves the body text verbatim (including newlines)", () => {
    const raw = "---\ntitle: X\ndescription: x\npubDate: 2026-01-01\n---\n\nLine 1\n\nLine 2\n";
    const { body } = parseFrontmatter(raw);
    expect(body).toBe("Line 1\n\nLine 2\n");
  });
});

describe("serializeFrontmatter", () => {
  it("round-trips through parse", () => {
    const fm: Frontmatter = {
      title: "X",
      description: "y",
      pubDate: new Date("2026-01-01T00:00:00.000Z"),
      tags: ["t1"],
      draft: false,
    };
    const text = serializeFrontmatter(fm, "Body\n");
    const re = parseFrontmatter(text);
    expect(re.frontmatter.title).toBe("X");
    expect(re.body).toBe("Body\n");
  });

  it("serializes pubDate as ISO date-only when no time component", () => {
    const fm: Frontmatter = {
      title: "X",
      description: "y",
      pubDate: new Date("2026-01-01T00:00:00.000Z"),
      tags: [],
      draft: false,
    };
    const text = serializeFrontmatter(fm, "");
    expect(text).toContain("pubDate: 2026-01-01");
  });
});
