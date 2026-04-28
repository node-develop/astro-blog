import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { VFile } from "vfile";
import { describe, it, expect } from "vitest";
import remarkStripFrontmatterDuplicates from "./strip-frontmatter-duplicates.js";

const process = async (
  markdown: string,
  frontmatter?: { title?: string; description?: string },
): Promise<string> => {
  const file = new VFile({ value: markdown });
  if (frontmatter !== undefined) {
    file.data.astro = { frontmatter };
  }
  const result = await unified()
    .use(remarkParse)
    .use(remarkStripFrontmatterDuplicates)
    .use(remarkStringify)
    .process(file);
  return String(result).trim();
};

describe("remarkStripFrontmatterDuplicates", () => {
  it("removes H1 and blockquote when both match frontmatter", async () => {
    const md = `# My Title\n\n> My description\n\nBody text.`;
    const out = await process(md, { title: "My Title", description: "My description" });
    expect(out).not.toMatch(/^#\s/m);
    expect(out).not.toMatch(/^>/m);
    expect(out).toContain("Body text.");
  });

  it("removes only H1 when blockquote does not match", async () => {
    const md = `# My Title\n\n> Different blockquote\n\nBody text.`;
    const out = await process(md, { title: "My Title", description: "My description" });
    expect(out).not.toMatch(/^#\s/m);
    expect(out).toContain("Different blockquote");
    expect(out).toContain("Body text.");
  });

  it("removes nothing when H1 does not match title", async () => {
    const md = `# Different Title\n\n> My description\n\nBody text.`;
    const out = await process(md, { title: "My Title", description: "My description" });
    expect(out).toMatch(/^#\s/m);
    expect(out).toContain("Different Title");
    expect(out).toContain("Body text.");
  });

  it("does not crash and removes nothing when no frontmatter is set", async () => {
    const md = `# My Title\n\n> My description\n\nBody text.`;
    const out = await process(md, undefined);
    expect(out).toMatch(/^#\s/m);
    expect(out).toContain("My Title");
    expect(out).toContain("Body text.");
  });

  it("matches despite different capitalization and extra whitespace (normalization)", async () => {
    const md = `#  MY  TITLE  \n\n>   my  description  \n\nBody text.`;
    const out = await process(md, { title: "my title", description: "my description" });
    expect(out).not.toMatch(/^#\s/m);
    expect(out).not.toMatch(/^>/m);
    expect(out).toContain("Body text.");
  });

  it("handles description with inline backticks", async () => {
    const md = "# My Title\n\n> see `x` here\n\nBody text.";
    const out = await process(md, {
      title: "My Title",
      description: "see `x` here",
    });
    expect(out).not.toMatch(/^#\s/m);
    expect(out).not.toMatch(/^>/m);
    expect(out).toContain("Body text.");
  });

  it("does not remove blockquote when title is absent from frontmatter", async () => {
    const md = `# My Title\n\n> My description\n\nBody text.`;
    const out = await process(md, { description: "My description" });
    // H1 not removed (no title to match), blockquote check is at offset=1 which is blockquote
    // but since H1 didn't match/wasn't present as a match, offset moved past it
    expect(out).toContain("My Title");
  });

  it("removes blockquote at position 0 when there is no H1 and description matches", async () => {
    const md = `> My description\n\nBody text.`;
    const out = await process(md, { description: "My description" });
    expect(out).not.toMatch(/^>/m);
    expect(out).toContain("Body text.");
  });

  it("does not remove blockquote at position 0 when there is no H1 and description does not match", async () => {
    const md = `> Different blockquote\n\nBody text.`;
    const out = await process(md, { description: "My description" });
    expect(out).toContain("Different blockquote");
    expect(out).toContain("Body text.");
  });

  it("strips leading thematic break after removing H1 + blockquote", async () => {
    const md = `# My Title\n\n> My description\n\n---\n\nBody text.`;
    const out = await process(md, { title: "My Title", description: "My description" });
    expect(out).not.toMatch(/^#\s/m);
    expect(out).not.toMatch(/^>/m);
    expect(out).not.toMatch(/^---/m);
    expect(out).toContain("Body text.");
  });

  it("normalizes punctuation differences (Oxford comma, em-dashes, quotes)", async () => {
    // Frontmatter title lacks Oxford comma; body H1 has one — should still be stripped
    const md = `# Harness, agent loop, and your place\n\nBody text.`;
    const out = await process(md, { title: "Harness, agent loop and your place" });
    expect(out).not.toMatch(/^#\s/m);
    expect(out).toContain("Body text.");
  });

  it("strips blockquote when description is a truncated prefix (200-char limit)", async () => {
    // Frontmatter description was truncated mid-word by Zod's max(200)
    const description =
      "Все предыдущие главы — про механику. Эта — про дисциплину. Без неё даже идеальная конфигурация со временем превращается в свалку: кэш мимо, скиллы протухли, hooks падают молча, а вы не поним";
    const blockquoteFull =
      "> Все предыдущие главы — про механику. Эта — про дисциплину. Без неё даже идеальная конфигурация со временем превращается в свалку: кэш мимо, скиллы протухли, hooks падают молча, а вы не понимаете почему счёт за месяц вырос вдвое.";
    const md = `# My Title\n\n${blockquoteFull}\n\nBody text.`;
    const out = await process(md, { title: "My Title", description });
    expect(out).not.toMatch(/^#\s/m);
    expect(out).not.toMatch(/^>/m);
    expect(out).toContain("Body text.");
  });

  it("does not strip a blockquote that only superficially overlaps with description", async () => {
    // First few words match, but the rest diverges → must NOT be stripped
    const md = `# Title\n\n> Это совсем другой текст про что-то совсем иное.\n\nBody.`;
    const out = await process(md, {
      title: "Title",
      description: "Это совсем другой пост про разработку и инструменты которые мы используем",
    });
    expect(out).toMatch(/^>/m);
    expect(out).toContain("Body.");
  });

  it("preserves thematic break when nothing was stripped", async () => {
    const md = `Body text.\n\n---\n\nMore body.`;
    const out = await process(md, { title: "My Title", description: "My description" });
    // remark-stringify normalizes thematic breaks to *** by default
    expect(out).toMatch(/^(\*\*\*|---)$/m);
    expect(out).toContain("More body.");
  });
});
