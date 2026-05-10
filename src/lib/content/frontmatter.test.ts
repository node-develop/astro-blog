import { describe, it, expect } from "vitest";
import {
  parseFrontmatter,
  serializeFrontmatter,
  stripLeadingFrontmatter,
  type Frontmatter,
} from "./frontmatter";

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

describe("stripLeadingFrontmatter", () => {
  it("returns body unchanged when no leading frontmatter present", () => {
    const body = "## Heading\n\nParagraph.";
    const out = stripLeadingFrontmatter(body);
    expect(out.body).toBe(body);
    expect(out.hadFrontmatter).toBe(false);
  });

  it("strips a single leading YAML block and reports the flag", () => {
    const body = [
      "---",
      'title: "Pasted"',
      "tags: [a, b]",
      "---",
      "",
      "Real body starts here.",
    ].join("\n");
    const out = stripLeadingFrontmatter(body);
    expect(out.body).toBe("Real body starts here.");
    expect(out.hadFrontmatter).toBe(true);
  });

  it("does not strip a pseudo-block missing the closing fence", () => {
    const body = "---\ntitle: not closed\n\nReal body.";
    const out = stripLeadingFrontmatter(body);
    expect(out.body).toBe(body);
    expect(out.hadFrontmatter).toBe(false);
  });

  it("does not strip a fenced block that is not at the very start", () => {
    const body = "Intro paragraph.\n\n---\ntitle: x\n---\n\nMore.";
    const out = stripLeadingFrontmatter(body);
    expect(out.body).toBe(body);
    expect(out.hadFrontmatter).toBe(false);
  });

  it("tolerates a leading UTF-8 BOM", () => {
    const body = "﻿---\ntitle: x\n---\n\nBody.";
    const out = stripLeadingFrontmatter(body);
    expect(out.body).toBe("Body.");
    expect(out.hadFrontmatter).toBe(true);
  });

  it("handles CRLF line endings", () => {
    const body = "---\r\ntitle: x\r\n---\r\n\r\nBody line.";
    const out = stripLeadingFrontmatter(body);
    expect(out.body).toBe("Body line.");
    expect(out.hadFrontmatter).toBe(true);
  });
});
