import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const path = join(process.cwd(), "src/content/site/uses.md");

describe("src/content/site/uses.md", () => {
  it("exists", () => expect(existsSync(path)).toBe(true));
  const md = existsSync(path) ? readFileSync(path, "utf8") : "";

  // Section names rename as the toolchain evolves ("Бэкенд" splits into
  // "Backend"+"Data"; "AI-инструменты" → "AI / LLM"; etc.). Test the
  // structural shape — at least 5 h2 sections covering these topic areas
  // — instead of pinning exact wording.
  const requiredTopicPatterns: ReadonlyArray<RegExp> = [
    /^##\s+(Редактор|Редакторы|IDE|Editor)/im,
    /^##\s+(Бэкенд|Backend)/im,
    /^##\s+(Cloud|Инфра|Кубер|Kubernetes)/im,
    /^##\s+(Observability|Наблюдаемость|Telemetry)/im,
    /^##\s+(AI|LLM)/im,
  ];
  it.each(requiredTopicPatterns.map((r) => r.source))("has a section matching %s", (src) => {
    const re = new RegExp(src, "im");
    expect(md).toMatch(re);
  });

  it("declares specific versions for ≥ 5 tools", () => {
    const m = md.match(/[A-Z][a-zA-Z.+]+\s+\d+(\.\d+)?/g) ?? [];
    expect(m.length).toBeGreaterThanOrEqual(5);
  });
  it("body has no h1", () => {
    const body = md.replace(/^---[\s\S]*?---\r?\n/, "");
    for (const line of body.split("\n")) expect(line.startsWith("# ")).toBe(false);
  });
  it("frontmatter has title", () => {
    expect(md).toMatch(/^---[\s\S]*title:[\s\S]*---/);
  });
});
