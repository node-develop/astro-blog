import { describe, expect, it } from "vitest";
import { buildLocaleSitemapEntries, renderUrlSet, type SitemapInput } from "~/lib/seo/sitemap";

const date = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const projectEntries = [
  { id: "astro-blog", data: { pubDate: date("2025-01-01"), updatedDate: date("2026-06-01") } },
  { id: "claude-code-guide", data: { pubDate: date("2026-02-02") } },
  {
    id: "en/astro-blog",
    data: { pubDate: date("2025-01-03"), updatedDate: date("2026-06-03") },
  },
  { id: "en/claude-code-guide", data: { pubDate: date("2026-02-04") } },
] as const;

const localeInput = (locale: "ru" | "en"): SitemapInput => ({
  locale,
  posts: [
    {
      entry: {
        id: locale === "ru" ? "post" : "en/post",
        data: { pubDate: date("2026-07-10"), updatedDate: date("2026-07-12") },
      },
    },
  ],
  courseEntries: [
    { id: "course/_index", data: { pubDate: date("2026-01-10") } },
    {
      id: "course/en/_index",
      data: { pubDate: date("2026-01-11"), updatedDate: date("2026-02-11") },
    },
  ],
  lessonEntries: [
    { id: "course/01-lesson", data: { pubDate: date("2026-03-10") } },
    { id: "course/en/01-lesson", data: { pubDate: date("2026-03-11") } },
  ],
  projectEntries,
  tagGroups: new Map([
    ["one-post", [{}]],
    ["seo", [{}, {}]],
  ]),
});

describe("locale sitemap inventory", () => {
  it("includes complete RU indexable content with content-derived dates", () => {
    const entries = buildLocaleSitemapEntries(localeInput("ru"));
    const ruUrls = entries.map((entry) => entry.loc);

    expect(ruUrls).toContain("https://artka.dev/projects/astro-blog/");
    expect(ruUrls).toContain("https://artka.dev/projects/claude-code-guide/");
    expect(ruUrls).toContain("https://artka.dev/tags/seo/");
    expect(ruUrls).not.toContain("https://artka.dev/tags/one-post/");
    expect(new Set(ruUrls).size).toBe(ruUrls.length);
    expect(entries.find((entry) => entry.loc.endsWith("/blog/post/"))?.lastmod).toBe("2026-07-12");
    expect(entries.find((entry) => entry.loc.endsWith("/projects/astro-blog/"))?.lastmod).toBe(
      "2026-06-01",
    );
    expect(entries.find((entry) => entry.loc.endsWith("/courses/course/"))?.lastmod).toBe(
      "2026-01-10",
    );
    expect(entries.find((entry) => entry.loc.endsWith("/01-lesson/"))?.lastmod).toBe("2026-03-10");
  });

  it("includes complete EN indexable content with stripped locale IDs", () => {
    const entries = buildLocaleSitemapEntries(localeInput("en"));
    const enUrls = entries.map((entry) => entry.loc);

    expect(enUrls).toContain("https://artka.dev/en/projects/astro-blog/");
    expect(enUrls).toContain("https://artka.dev/en/projects/claude-code-guide/");
    expect(enUrls).toContain("https://artka.dev/en/tags/seo/");
    expect(enUrls).not.toContain("https://artka.dev/en/tags/one-post/");
    expect(enUrls).toContain("https://artka.dev/en/courses/course/01-lesson/");
    expect(new Set(enUrls).size).toBe(enUrls.length);
  });

  it("keeps navigation roots first and sorts all generated URLs by location", () => {
    const locations = buildLocaleSitemapEntries(localeInput("ru")).map((entry) => entry.loc);

    expect(locations.slice(0, 7)).toEqual([
      "https://artka.dev/",
      "https://artka.dev/blog/",
      "https://artka.dev/projects/",
      "https://artka.dev/about/",
      "https://artka.dev/uses/",
      "https://artka.dev/now/",
      "https://artka.dev/tags/",
    ]);
    expect(locations.slice(7)).toEqual([...locations.slice(7)].sort());
  });

  it("rejects duplicate canonical locations", () => {
    const input = localeInput("ru");
    expect(() =>
      buildLocaleSitemapEntries({
        ...input,
        posts: [...input.posts, ...input.posts],
      }),
    ).toThrow(/Duplicate sitemap URL: https:\/\/artka\.dev\/blog\/post\//);
  });
});

describe("URL-set XML", () => {
  it("escapes locations and renders optional sitemap fields", () => {
    expect(
      renderUrlSet([
        {
          loc: "https://artka.dev/blog/?a=1&b=2",
          lastmod: "2026-07-12",
          changefreq: "monthly",
          priority: 0.8,
        },
      ]),
    ).toContain(`    <loc>https://artka.dev/blog/?a=1&amp;b=2</loc>
    <lastmod>2026-07-12</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>`);
  });
});
