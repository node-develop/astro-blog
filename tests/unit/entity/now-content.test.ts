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
  it("has at least one h2 section header in the body", () => {
    // The page evolves — sections rename as focus shifts. We just want to
    // make sure the page never collapses to a single wall of text without
    // any structural header.
    expect(md).toMatch(/^##\s+\S/m);
  });
  it("body has no h1", () => {
    const body = md.replace(/^---[\s\S]*?---\r?\n/, "");
    for (const line of body.split("\n")) expect(line.startsWith("# ")).toBe(false);
  });
});
