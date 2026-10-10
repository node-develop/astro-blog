import { describe, it, expect } from "vitest";
import { articleFromParsed, computeSourceHash, loadFileArticle } from "~/lib/social/article";
import type { Frontmatter } from "~/lib/content/frontmatter";

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

describe("loadFileArticle", () => {
  it("reads a real fixture and returns correct shape", async () => {
    const article = await loadFileArticle("local-coding-agent");

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
    const article = await loadFileArticle("local-coding-agent");
    expect(article.hasEnTwin).toBe(true);
  });

  it("hands social networks an absolute image URL, not the site-relative placeholder", async () => {
    // local-coding-agent has `cover: /og-default.png`: the draft must carry the
    // post's own card instead.
    const article = await loadFileArticle("local-coding-agent");
    expect(article.cover).toEqual({
      src: "https://artka.dev/og/local-coding-agent-ru.png",
      alt: article.title,
    });
  });

  it("throws article not found for a non-existent slug", async () => {
    await expect(loadFileArticle("this-slug-does-not-exist-xyz")).rejects.toThrow(
      "article not found: posts/this-slug-does-not-exist-xyz",
    );
  });

  it("refuses a slug that leaves the posts directory", async () => {
    // ../../../CLAUDE resolves to the repository's CLAUDE.md, a real file outside src/content/posts.
    await expect(loadFileArticle("../../../CLAUDE")).rejects.toThrow("article not found");
  });
});

describe("articleFromParsed", () => {
  const fm = (over: Partial<Frontmatter> = {}): Frontmatter => ({
    title: "Title",
    description: "Description",
    pubDate: new Date("2026-01-01T00:00:00Z"),
    tags: ["ai"],
    draft: false,
    ...over,
  });
  const build = (over: Partial<Frontmatter>) =>
    articleFromParsed({ slug: "s", frontmatter: fm(over), body: "B", hasEnTwin: false });

  it("makes a site-relative cover absolute and keeps its alt", () => {
    expect(build({ cover: "/uploads/2026/a.png", coverAlt: "A cat" }).cover).toEqual({
      src: "https://artka.dev/uploads/2026/a.png",
      alt: "A cat",
    });
  });

  it("keeps an https cover as is", () => {
    expect(build({ cover: "https://cdn.example.com/a.png", coverAlt: "x" }).cover?.src).toBe(
      "https://cdn.example.com/a.png",
    );
  });

  it("falls back to the post's own og card, titled, when there is no real cover", () => {
    const expected = { src: "https://artka.dev/og/s-ru.png", alt: "Title" };
    expect(build({}).cover).toEqual(expected);
    expect(build({ cover: "/og-default.png", coverAlt: "ignored" }).cover).toEqual(expected);
  });

  it("takes the summary, else the description", () => {
    expect(build({ summary: "Sum" }).summary).toBe("Sum");
    expect(build({}).summary).toBe("Description");
  });
});
