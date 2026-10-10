import { describe, expect, it } from "vitest";
import {
  attachAlternates,
  buildLocaleSitemapEntries,
  counterpartLocation,
  latestLastmod,
  renderSitemapIndex,
  renderUrlSet,
  type SitemapInput,
} from "~/lib/seo/sitemap";

const date = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const projectEntries = [
  { id: "astro-blog", data: { pubDate: date("2025-01-01"), updatedDate: date("2026-06-01") } },
  { id: "second-project", data: { pubDate: date("2026-02-02") } },
  {
    id: "en/astro-blog",
    data: { pubDate: date("2025-01-03"), updatedDate: date("2026-06-03") },
  },
  { id: "en/second-project", data: { pubDate: date("2026-02-04") } },
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
  projectEntries,
});

describe("locale sitemap inventory", () => {
  it("includes complete RU indexable content with content-derived dates", () => {
    const entries = buildLocaleSitemapEntries(localeInput("ru"));
    const ruUrls = entries.map((entry) => entry.loc);

    expect(ruUrls).toContain("https://artka.dev/projects/astro-blog/");
    expect(ruUrls).toContain("https://artka.dev/projects/second-project/");
    expect(new Set(ruUrls).size).toBe(ruUrls.length);
    expect(entries.find((entry) => entry.loc.endsWith("/blog/post/"))?.lastmod).toBe("2026-07-12");
    expect(entries.find((entry) => entry.loc.endsWith("/projects/astro-blog/"))?.lastmod).toBe(
      "2026-06-01",
    );
  });

  it("includes complete EN indexable content with stripped locale IDs", () => {
    const entries = buildLocaleSitemapEntries(localeInput("en"));
    const enUrls = entries.map((entry) => entry.loc);

    expect(enUrls).toContain("https://artka.dev/en/projects/astro-blog/");
    expect(enUrls).toContain("https://artka.dev/en/projects/second-project/");
    expect(new Set(enUrls).size).toBe(enUrls.length);
  });

  it("keeps navigation roots first and sorts all generated URLs by location", () => {
    const locations = buildLocaleSitemapEntries(localeInput("ru")).map((entry) => entry.loc);

    expect(locations.slice(0, 6)).toEqual([
      "https://artka.dev/",
      "https://artka.dev/blog/",
      "https://artka.dev/projects/",
      "https://artka.dev/about/",
      "https://artka.dev/uses/",
      "https://artka.dev/now/",
    ]);
    expect(locations.slice(6)).toEqual([...locations.slice(6)].sort());
  });

  // Tag archives and the tag index are noindex,follow; a sitemap entry would
  // ask the crawler to index a page that refuses it.
  it("lists no tag archive or tag index in either locale", () => {
    for (const locale of ["ru", "en"] as const) {
      const locations = buildLocaleSitemapEntries(localeInput(locale)).map((entry) => entry.loc);
      expect(locations.length).toBeGreaterThan(0);
      expect(locations.filter((loc) => /\/tags\//.test(new URL(loc).pathname))).toEqual([]);
    }
  });

  it("includes localized contact and privacy pages even with no content", () => {
    const empty = (locale: "ru" | "en"): SitemapInput => ({
      locale,
      posts: [],
      projectEntries: [],
    });
    const ruUrls = buildLocaleSitemapEntries(empty("ru")).map((entry) => entry.loc);
    const enUrls = buildLocaleSitemapEntries(empty("en")).map((entry) => entry.loc);

    expect(ruUrls).toEqual(
      expect.arrayContaining(["https://artka.dev/contact/", "https://artka.dev/privacy/"]),
    );
    expect(enUrls).toEqual(
      expect.arrayContaining(["https://artka.dev/en/contact/", "https://artka.dev/en/privacy/"]),
    );
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

describe("image sitemap extension", () => {
  it("lists a post's real cover and declares the image namespace; pages without one stay bare", () => {
    const xml = renderUrlSet([
      { loc: "https://artka.dev/blog/a/", images: ["https://media.example.com/a.png?x=1&y=2"] },
      { loc: "https://artka.dev/blog/b/" },
    ]);
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml.match(/<image:image>/g)).toHaveLength(1);
    expect(xml).toContain("<image:loc>https://media.example.com/a.png?x=1&amp;y=2</image:loc>");
  });
});

describe("hreflang alternates", () => {
  it("cross-links only pages present in both locale inventories, x-default → RU", () => {
    const ru = buildLocaleSitemapEntries(localeInput("ru"));
    const en = buildLocaleSitemapEntries({
      ...localeInput("en"),
      // EN lacks the second project → its RU page must not advertise an alternate.
      projectEntries: projectEntries.filter((entry) => entry.id !== "en/second-project"),
    });
    const ruLinked = attachAlternates(ru, "ru", en);
    const enLinked = attachAlternates(en, "en", ru);

    const home = ruLinked.find((e) => e.loc === "https://artka.dev/")!;
    expect(home.alternates).toEqual([
      { hreflang: "ru", href: "https://artka.dev/" },
      { hreflang: "en", href: "https://artka.dev/en/" },
      { hreflang: "x-default", href: "https://artka.dev/" },
    ]);
    const post = enLinked.find((e) => e.loc === "https://artka.dev/en/blog/post/")!;
    expect(post.alternates).toEqual([
      { hreflang: "ru", href: "https://artka.dev/blog/post/" },
      { hreflang: "en", href: "https://artka.dev/en/blog/post/" },
      { hreflang: "x-default", href: "https://artka.dev/blog/post/" },
    ]);
    expect(
      ruLinked.find((e) => e.loc === "https://artka.dev/projects/second-project/")!.alternates,
    ).toBeUndefined();
    expect(counterpartLocation("https://artka.dev/en/", "en")).toBe("https://artka.dev/");
    expect(counterpartLocation("https://artka.dev/blog/x/", "ru")).toBe(
      "https://artka.dev/en/blog/x/",
    );
  });

  it("renders xhtml:link alternates inside <url> with the xhtml namespace declared", () => {
    const xml = renderUrlSet([
      {
        loc: "https://artka.dev/blog/post/",
        alternates: [
          { hreflang: "ru", href: "https://artka.dev/blog/post/" },
          { hreflang: "en", href: "https://artka.dev/en/blog/post/" },
          { hreflang: "x-default", href: "https://artka.dev/blog/post/" },
        ],
      },
    ]);
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
    expect(xml).toContain(
      '    <xhtml:link rel="alternate" hreflang="en" href="https://artka.dev/en/blog/post/" />',
    );
    expect(xml).toContain('hreflang="x-default" href="https://artka.dev/blog/post/"');
  });
});

describe("sitemap index", () => {
  it("stamps each child with the newest lastmod of its entries", () => {
    const entries = buildLocaleSitemapEntries(localeInput("ru"));
    expect(latestLastmod(entries)).toBe("2026-07-12");
    expect(latestLastmod([{ loc: "https://artka.dev/" }])).toBeNull();
    const xml = renderSitemapIndex([
      { loc: "https://artka.dev/sitemap-ru.xml", entries },
      { loc: "https://artka.dev/sitemap-en.xml", entries: [{ loc: "https://artka.dev/en/" }] },
    ]);
    expect(xml).toContain(
      "  <sitemap>\n    <loc>https://artka.dev/sitemap-ru.xml</loc>\n    <lastmod>2026-07-12</lastmod>\n  </sitemap>",
    );
    expect(xml).toContain(
      "  <sitemap>\n    <loc>https://artka.dev/sitemap-en.xml</loc>\n  </sitemap>",
    );
  });
});
