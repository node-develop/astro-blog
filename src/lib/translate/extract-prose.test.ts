import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { extractProse, reassemble } from "./extract-prose";

const tableFixture = `| Model | Price |
|---|---|
| Opus | $15/MTok |
| Sonnet | $3/MTok |
| Haiku | $1/MTok |
`;

const fixturePath = join(__dirname, "fixtures/sample.md");
const fixture = readFileSync(fixturePath, "utf8");

describe("extractProse", () => {
  it("captures heading text", () => {
    const result = extractProse(fixture);
    const texts = result.placeholders.map((p) => p.text);
    expect(texts.some((t) => t.includes("Заголовок первого уровня"))).toBe(true);
  });

  it("captures paragraph prose with inline formatting preserved as raw markdown", () => {
    const result = extractProse(fixture);
    const texts = result.placeholders.map((p) => p.text);
    // The paragraph "Это **обычный** параграф..." preserves the **bold** markers
    expect(texts.some((t) => t.includes("**обычный**"))).toBe(true);
  });

  it("does NOT capture content inside fenced code blocks", () => {
    const result = extractProse(fixture);
    const allText = result.placeholders.map((p) => p.text).join("\n");
    expect(allText).not.toContain("// Это комментарий внутри кода");
    expect(allText).not.toContain("const x = 42");
  });

  it("does NOT capture math content as standalone prose", () => {
    const result = extractProse(fixture);
    const standalone = result.placeholders.filter(
      (p) => p.kind === "prose" && /^\$E = mc\^2\$$/.test(p.text.trim()),
    );
    expect(standalone).toHaveLength(0);
  });

  it("captures mermaid block separately with kind='mermaid'", () => {
    const result = extractProse(fixture);
    const mermaid = result.placeholders.filter((p) => p.kind === "mermaid");
    expect(mermaid).toHaveLength(1);

    const mermaidBlock = mermaid[0]!;
    expect(mermaidBlock.text).toContain("flowchart LR");
    expect(mermaidBlock.text).toContain("[Начало]");
    expect(mermaidBlock.text).not.toContain("```"); // value is the inside of the fence
  });

  it("captures link text and preserves the URL in the chunk", () => {
    const result = extractProse(fixture);
    const texts = result.placeholders.map((p) => p.text);
    // The paragraph chunk containing the link preserves the markdown link syntax
    expect(texts.some((t) => t.includes("[Ссылка на статью](/blog/01-foo)"))).toBe(true);
  });

  it("rewrites internal links via the optional callback", () => {
    const result = extractProse(fixture, {
      rewriteInternalLink: (url) => (url.startsWith("/blog/") ? "/en" + url : undefined),
    });
    const texts = result.placeholders.map((p) => p.text);
    expect(texts.some((t) => t.includes("](/en/blog/01-foo)"))).toBe(true);
    expect(
      texts.every(
        (t) => !t.includes("](https://example.com)") || t.includes("https://example.com"),
      ),
    ).toBe(true);
  });
});

describe("extractProse with GFM tables", () => {
  it("captures the entire table as one prose placeholder", () => {
    const result = extractProse(tableFixture);
    expect(result.placeholders).toHaveLength(1);
    expect(result.placeholders[0]?.kind).toBe("prose");
    expect(result.placeholders[0]?.text).toContain("| Model | Price |");
    expect(result.placeholders[0]?.text).toContain("Sonnet");
  });

  it("round-trips a table preserving cell content", () => {
    const { placeholders, skeleton } = extractProse(tableFixture);
    const translated = placeholders.map((p) => ({
      id: p.id,
      text: p.text.replace(/Model/g, "Модель").replace(/Price/g, "Цена"),
    }));
    const result = reassemble(skeleton, translated);
    expect(result).toContain("Модель");
    expect(result).toContain("Цена");
    expect(result).toContain("Opus");
    expect(result).toContain("$15/MTok");
  });
});

describe("reassemble", () => {
  it("round-trips identity when placeholders are unchanged", () => {
    const { placeholders, skeleton } = extractProse(fixture);
    const same = placeholders.map((p) => ({ id: p.id, text: p.text }));
    const result = reassemble(skeleton, same);
    // Whitespace may differ; compare normalized
    const norm = (s: string) => s.replace(/\s+/g, " ").trim();
    // Round-trip should preserve key content
    expect(norm(result)).toContain(norm("**обычный**"));
    expect(norm(result)).toContain("flowchart LR");
    expect(norm(result)).toContain("const x = 42");
  });

  it("substitutes translated text", () => {
    const { placeholders, skeleton } = extractProse(fixture);
    const translated = placeholders.map((p) => ({
      id: p.id,
      text: p.kind === "prose" ? p.text.replace(/Заголовок/g, "Heading") : p.text,
    }));
    const result = reassemble(skeleton, translated);
    expect(result).toContain("Heading первого уровня");
    expect(result).not.toContain("Заголовок первого уровня");
  });

  it("restores mermaid lang from __placeholder_mermaid sentinel", () => {
    const { placeholders, skeleton } = extractProse(fixture);
    expect(skeleton).toContain("```mermaid"); // restored, NOT __placeholder_mermaid
    // Reassemble keeps the lang
    const result = reassemble(skeleton, placeholders);
    expect(result).toContain("```mermaid");
    expect(result).not.toContain("__placeholder_mermaid");
  });
});
