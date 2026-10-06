import { describe, expect, it } from "vitest";
import type { ExportSnapshot } from "../../src/lib/content-api/contract";
import { checkCiResult, lighthousePaths } from "./ci-result";

const article = (slug: string, lang: "ru" | "en", hiddenFromList = false) => ({
  slug,
  lang,
  revision: "00000000-0000-4000-8000-000000000000",
  content: "",
  contentSha256: "0".repeat(64),
  meta: { order: 0, pinned: false, hiddenFromList },
});
const snapshot = (articles: ReturnType<typeof article>[]): ExportSnapshot => ({
  snapshotId: "00000000-0000-4000-8000-000000000000",
  generatedAt: "2026-10-05T00:00:00.000Z",
  count: articles.length,
  articles,
});

describe("lighthousePaths", () => {
  it("takes the first listed RU article that has a listed EN twin", () => {
    const paths = lighthousePaths(
      snapshot([
        article("ru-only", "ru"),
        article("hidden", "ru"),
        article("hidden", "en", true),
        article("both", "ru"),
        article("both", "en"),
      ]),
    );
    expect(paths).toEqual(["/", "/blog/both/", "/en/blog/both/"]);
  });

  it("fails loud when no article has a twin", () => {
    expect(() => lighthousePaths(snapshot([article("ru-only", "ru")]))).toThrow(/EN twin/);
  });
});

describe("checkCiResult", () => {
  const scores = { performance: 0.9, accessibility: 1, seo: 1 };
  const expected = ["/", "/blog/a/", "/en/blog/a/"];
  const full = expected.map((path) => ({ path, score: 0.9, ...scores }));

  it("accepts a result that scanned every page with every score", () => {
    expect(checkCiResult(full, expected)).toEqual([]);
  });

  it("names a page that is missing from the result", () => {
    expect(checkCiResult(full.slice(0, 2), expected).join("\n")).toContain("/en/blog/a/");
  });

  it("names a page whose report has no numeric category score", () => {
    const broken = full.map((row) => (row.path === "/" ? { path: row.path } : row));
    const issues = checkCiResult(broken, expected);
    expect(issues).toHaveLength(3);
    expect(issues.join("\n")).toContain("no numeric performance");
  });

  it("rejects an empty or malformed result", () => {
    expect(checkCiResult([], expected)).toHaveLength(3);
    expect(checkCiResult({}, expected)).toHaveLength(1);
  });
});
