import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it, expect, vi } from "vitest";
import { articleFromParsed, computeSourceHash, loadFileArticle } from "~/lib/social/article";
import type { Frontmatter } from "~/lib/content/frontmatter";

// The tests own the legacy files (TODO(cutover), prompt 3.6), so they pass with
// src/content/posts empty. The directory is <tmp>/posts: <tmp>/outside.md is where a slug that
// leaves it would land.
const postsDir = await vi.hoisted(async () => {
  const { writeLegacyPosts } = await import("../../../support/legacy-posts");
  return writeLegacyPosts({
    "legacy-twin.md": { title: "Legacy twin", cover: "/og-default.png" },
    "en/legacy-twin.md": { title: "Legacy twin" },
    "legacy-ru-only.md": { title: "Legacy RU only" },
  });
});
vi.mock("~/lib/fs/paths", async (original) => ({
  ...(await original<typeof import("~/lib/fs/paths")>()),
  POSTS_DIR: postsDir,
}));

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
  it("reads a legacy file post and returns correct shape", async () => {
    const article = await loadFileArticle("legacy-twin");

    expect(article.slug).toBe("legacy-twin");
    expect(article.collection).toBe("posts");
    expect(article.title.length).toBeGreaterThan(0);
    expect(article.body.length).toBeGreaterThan(0);
    expect(article.lang).toBe("ru");
    expect(article.pubDate).toBeInstanceOf(Date);
    expect(Array.isArray(article.tags)).toBe(true);
    expect(article.sourceUrl).toBe("https://artka.dev/blog/legacy-twin");
  });

  it("populates hasEnTwin:true for a post with an EN twin file", async () => {
    const article = await loadFileArticle("legacy-twin");
    expect(article.hasEnTwin).toBe(true);
  });

  it("populates hasEnTwin:false for a post without EN twin", async () => {
    const article = await loadFileArticle("legacy-ru-only");
    expect(article.hasEnTwin).toBe(false);
  });

  it("hands social networks an absolute image URL, not the site-relative placeholder", async () => {
    // legacy-twin has `cover: /og-default.png`: the draft must carry the post's own card instead.
    const article = await loadFileArticle("legacy-twin");
    expect(article.cover).toEqual({
      src: "https://artka.dev/og/legacy-twin-ru.png",
      alt: article.title,
    });
  });

  it("throws article not found for a non-existent slug", async () => {
    await expect(loadFileArticle("this-slug-does-not-exist-xyz")).rejects.toThrow(
      "article not found: posts/this-slug-does-not-exist-xyz",
    );
  });

  it("refuses a slug that leaves the posts directory", async () => {
    // Without resolveSafe this would read the file next to the posts directory.
    writeFileSync(
      join(dirname(postsDir), "outside.md"),
      "---\ntitle: Outside\n---\nOutside body\n",
    );
    await expect(loadFileArticle("../outside")).rejects.toThrow("article not found");
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
