import { resolve } from "node:path";
import { parseFrontmatter } from "@astrojs/markdown-remark";
import { describe, expect, it } from "vitest";
import { exportSchema } from "~/lib/content-api/contract";
import { checkSnapshot, FIXTURE_SNAPSHOT, readJson, readManifest } from "~/lib/content/snapshot";

// The built and e2e suites run against this file when CONTENT_SNAPSHOT is not set and look for
// these shapes by name. Regenerate with `pnpm content:fixture`; this test says what went missing.
const root = process.cwd();
const raw = await readJson(resolve(root, FIXTURE_SNAPSHOT));
const { minArticles } = await readManifest(root);
const snapshot = exportSchema.parse(raw);
const parsed = snapshot.articles.map((article) => ({
  article,
  ...parseFrontmatter(article.content),
}));
const find = (predicate: (item: (typeof parsed)[number]) => boolean) => parsed.filter(predicate);

describe("the content snapshot fixture", () => {
  it("is a snapshot the loader accepts, with the real floor", () => {
    expect(() => checkSnapshot(raw, minArticles, FIXTURE_SNAPSHOT)).not.toThrow();
  });

  it("has a page hidden from lists", () => {
    expect(find((p) => p.article.meta.hiddenFromList).length).toBeGreaterThan(0);
  });

  it("has an article with no twin in the other language", () => {
    const counts = new Map<string, number>();
    for (const { slug } of snapshot.articles) counts.set(slug, (counts.get(slug) ?? 0) + 1);
    expect([...counts.values()].some((count) => count === 1)).toBe(true);
  });

  it("has an English article with a Mermaid diagram", () => {
    expect(
      find((p) => p.article.lang === "en" && p.content.includes("```mermaid")).length,
    ).toBeGreaterThan(0);
  });

  it("has a cover that is also the social image, with its size", () => {
    const covered = find(
      (p) =>
        typeof p.frontmatter.cover === "string" &&
        p.frontmatter.socialImage === p.frontmatter.cover &&
        typeof p.frontmatter.socialImageWidth === "number" &&
        typeof p.frontmatter.socialImageHeight === "number",
    );
    expect(covered.length).toBeGreaterThan(0);
  });

  it("has block math", () => {
    expect(find((p) => /^\$\$$/m.test(p.content)).length).toBeGreaterThan(0);
  });

  it("has a body that opens with a quote of its own description", () => {
    expect(
      find((p) => p.content.trimStart().startsWith(`> ${String(p.frontmatter.description)}`))
        .length,
    ).toBeGreaterThan(0);
  });
});
