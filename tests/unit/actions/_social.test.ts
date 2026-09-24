import { describe, it, expect } from "vitest";
import { computeSourceHash, loadArticle } from "~/actions/_social";

describe("computeSourceHash", () => {
  it("changes when body changes", () => {
    const a = computeSourceHash({ title: "T", body: "B1", frontmatter: {} });
    const b = computeSourceHash({ title: "T", body: "B2", frontmatter: {} });
    expect(a).not.toBe(b);
  });

  it("changes when title changes", () => {
    const a = computeSourceHash({ title: "T1", body: "B", frontmatter: {} });
    const b = computeSourceHash({ title: "T2", body: "B", frontmatter: {} });
    expect(a).not.toBe(b);
  });

  it("changes when frontmatter changes", () => {
    const a = computeSourceHash({ title: "T", body: "B", frontmatter: { tags: ["a"] } });
    const b = computeSourceHash({ title: "T", body: "B", frontmatter: { tags: ["b"] } });
    expect(a).not.toBe(b);
  });
});

describe("loadArticle", () => {
  it("reads a real fixture and returns correct shape", async () => {
    const article = await loadArticle("local-coding-agent");

    expect(article.slug).toBe("local-coding-agent");
    expect(article.collection).toBe("posts");
    expect(article.title.length).toBeGreaterThan(0);
    expect(article.body.length).toBeGreaterThan(0);
    expect(article.lang).toBe("ru");
    expect(article.pubDate).toBeInstanceOf(Date);
    expect(Array.isArray(article.tags)).toBe(true);
    expect(article.sourceUrl).toBe("https://artka.dev/blog/local-coding-agent");
  });

  it("populates hasEnTwin:true for local-coding-agent (EN twin exists)", async () => {
    const article = await loadArticle("local-coding-agent");
    expect(article.hasEnTwin).toBe(true);
  });

  it("populates hasEnTwin:false for a post without EN twin", async () => {
    // claude.md has no EN twin in src/content/posts/en/
    const article = await loadArticle("claude");
    expect(article.hasEnTwin).toBe(false);
  });

  it("throws article not found for a non-existent slug", async () => {
    await expect(loadArticle("this-slug-does-not-exist-xyz")).rejects.toThrow(
      "article not found: posts/this-slug-does-not-exist-xyz",
    );
  });
});
