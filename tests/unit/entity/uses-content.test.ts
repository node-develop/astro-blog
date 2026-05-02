import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "src/content/site/uses.md");

describe("src/content/site/uses.md", () => {
  it("exists", () => expect(existsSync(path)).toBe(true));
  const md = existsSync(path) ? readFileSync(path, "utf8") : "";

  const required = [
    "## Редактор",
    "## Бэкенд",
    "## Инфра",
    "## Наблюдаемость",
    "## AI-инструменты",
  ];
  it.each(required)("has section %s", (h) => expect(md).toContain(h));

  it("declares specific versions for ≥ 5 tools", () => {
    const m = md.match(/[A-Z][a-zA-Z.+]+\s+\d+(\.\d+)?/g) ?? [];
    expect(m.length).toBeGreaterThanOrEqual(5);
  });
  it("body has no h1", () => {
    const body = md.replace(/^---[\s\S]*?---\r?\n/, "");
    for (const line of body.split("\n")) expect(line.startsWith("# ")).toBe(false);
  });
  it("frontmatter has title and description", () => {
    expect(md).toMatch(/^---[\s\S]*title:[\s\S]*description:[\s\S]*---/);
  });
});
