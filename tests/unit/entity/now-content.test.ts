import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "src/content/site/now.md");

describe("src/content/site/now.md", () => {
  it("exists", () => expect(existsSync(path)).toBe(true));
  const md = existsSync(path) ? readFileSync(path, "utf8") : "";

  it("frontmatter has title and description", () => {
    expect(md).toMatch(/^---[\s\S]*title:[\s\S]*description:[\s\S]*---/);
  });
  it("body has a 'last updated' line in YYYY-MM format or full date", () => {
    expect(md).toMatch(/(?:обновлено|updated)[^\n]*?\d{4}-\d{2}/i);
  });
  it("contains a '## Сейчас' section header", () => {
    // \b doesn't work with Cyrillic in JS; match heading line directly
    expect(md).toMatch(/^##\s+Сейчас(\s|$)/m);
  });
  it("body has no h1", () => {
    const body = md.replace(/^---[\s\S]*?---\r?\n/, "");
    for (const line of body.split("\n")) expect(line.startsWith("# ")).toBe(false);
  });
});
