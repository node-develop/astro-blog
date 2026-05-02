import { describe, expect, it } from "vitest";
import { extractArticleBody, countWords } from "~/lib/seo/article-body";

describe("countWords", () => {
  it("counts whitespace-separated tokens", () => {
    expect(countWords("hello world")).toBe(2);
    expect(countWords("  one\ttwo\nthree  ")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});

describe("extractArticleBody", () => {
  it("strips fenced code blocks entirely", () => {
    const md = "Intro paragraph.\n\n```ts\nconst x = 1;\n```\n\nAfter code.";
    const out = extractArticleBody(md, 100);
    expect(out.text).not.toContain("const x");
    expect(out.text).toContain("Intro paragraph");
    expect(out.text).toContain("After code");
  });

  it("strips inline code but keeps surrounding prose", () => {
    const md = "Use `foo()` carefully.";
    const out = extractArticleBody(md, 100);
    expect(out.text).toContain("Use");
    expect(out.text).toContain("carefully");
  });

  it("preserves paragraph text and headings", () => {
    const md = "# Title\n\nFirst paragraph.\n\nSecond paragraph.";
    const out = extractArticleBody(md, 100);
    expect(out.text).toContain("Title");
    expect(out.text).toContain("First paragraph");
    expect(out.text).toContain("Second paragraph");
  });

  it("truncates to maxWords with ellipsis", () => {
    const words = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
    const out = extractArticleBody(words, 10);
    expect(out.text.split(/\s+/).filter(Boolean).length).toBeLessThanOrEqual(11); // 10 + ellipsis
    expect(out.text.endsWith("…")).toBe(true);
  });

  it("returns full wordCount of original body, not the truncated excerpt", () => {
    const words = Array.from({ length: 50 }, (_, i) => `w${i}`).join(" ");
    const out = extractArticleBody(words, 10);
    expect(out.fullWordCount).toBe(50);
  });

  it("strips mermaid blocks", () => {
    const md = "Before.\n\n```mermaid\nflowchart LR\n  A --> B\n```\n\nAfter.";
    const out = extractArticleBody(md, 100);
    expect(out.text).not.toContain("flowchart");
    expect(out.text).not.toContain("A --> B");
  });
});
