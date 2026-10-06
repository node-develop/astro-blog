import { describe, expect, inject, it } from "vitest";
import { BLOG_PAGE_SIZE } from "~/lib/content/blog-pagination";
import { fetchWithTimeout } from "../support/production-server";
import { fixtureGuard } from "../support/snapshot";

const articleLinks = (html: string, prefix: string): string[] => [
  ...new Set(
    [...html.matchAll(/href="([^"]+)"/g)]
      .map((match) => match[1]!)
      .filter((href) => new RegExp(`^${prefix}/blog/[^/]+/$`).test(href)),
  ),
];

const mainOf = (html: string): string => html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? "";

// The rule is checked against the feed alone, because an expectation built from BLOG_PAGE_SIZE
// agrees with any page size. Nothing here is a hard-coded article count, and an archive that
// outgrows one page is not a failure: the check follows the archive's own pagination (page 1,
// then the lazy partials).
// Known gap: from post #(BLOG_PAGE_SIZE + 1) on, a post is only in the partials, which carry
// `X-Robots-Tag: noindex` and have no server-rendered link. Nothing here catches that.
const origin = inject("siteOrigin");

const loadFeed = async (prefix: string): Promise<string[]> => {
  const feedResponse = await fetchWithTimeout(`${origin}${prefix}/feed.json`);
  expect(feedResponse.status).toBe(200);
  const feed = (await feedResponse.json()) as {
    items: { url: string; date_published: string }[];
  };
  const dates = feed.items.map((item) => Date.parse(item.date_published));
  expect(dates).toEqual([...dates].sort((a, b) => b - a));
  return feed.items.map((item) => new URL(item.url).pathname);
};

const homeLinksOf = async (prefix: string): Promise<string[]> => {
  const homeResponse = await fetchWithTimeout(`${origin}${prefix}/`);
  expect(homeResponse.status, `${prefix}/`).toBe(200);
  return articleLinks(mainOf(await homeResponse.text()), prefix);
};

describe("latest publications in the built site", () => {
  it("lists the whole feed, in order and without gaps, on the first page plus the partials", async () => {
    for (const prefix of ["", "/en"]) {
      const feedPaths = await loadFeed(prefix);

      // Homepage: whatever number of cards it shows, they are the newest
      // articles in feed order with no gaps — a post must not be skipped.
      const homeLinks = await homeLinksOf(prefix);
      expect(homeLinks, `${prefix}/`).toEqual(feedPaths.slice(0, homeLinks.length));

      // Archive: the whole first page is in the HTML, not behind the loader.
      const blogResponse = await fetchWithTimeout(`${origin}${prefix}/blog/`);
      expect(blogResponse.status, `${prefix}/blog/`).toBe(200);
      const blogHtml = await blogResponse.text();
      expect(articleLinks(mainOf(blogHtml), prefix), `${prefix}/blog/`).toEqual(
        feedPaths.slice(0, BLOG_PAGE_SIZE),
      );

      // The rule itself, following the pagination: the feed is the whole
      // archive (it is not paginated), so every item must be listed, in order,
      // by page 1 plus the lazy partials, and the partials must stop where the
      // feed does. While the archive fits one page the index must not arm a
      // sentinel that would fetch a 404.
      const listed = articleLinks(mainOf(blogHtml), prefix);
      for (let page = 2; listed.length < feedPaths.length; page += 1) {
        const next = await fetchWithTimeout(`${origin}${prefix}/blog/partials/${page}/`);
        expect(next.status, `${prefix}/blog/partials/${page}/`).toBe(200);
        listed.push(...articleLinks(await next.text(), prefix));
        expect(page, `${prefix}/blog/ pagination does not converge`).toBeLessThan(1000);
      }
      expect(listed, `${prefix}/blog/ and its pages list the feed`).toEqual(feedPaths);
      const past = await fetchWithTimeout(
        `${origin}${prefix}/blog/partials/${Math.max(2, Math.ceil(feedPaths.length / BLOG_PAGE_SIZE) + 1)}/`,
      );
      expect(past.status).toBe(404);
      if (feedPaths.length > BLOG_PAGE_SIZE) expect(blogHtml).toContain("data-blog-sentinel");
      else expect(blogHtml).not.toContain("data-blog-sentinel");
    }
  });

  // The shape of the corpus: the checks above are vacuous on a tiny archive.
  fixtureGuard(
    "has enough publications for the feed and the home page to be compared",
    async () => {
      for (const prefix of ["", "/en"]) {
        expect((await loadFeed(prefix)).length, prefix).toBeGreaterThan(4);
        expect((await homeLinksOf(prefix)).length, `${prefix}/`).toBeGreaterThanOrEqual(4);
      }
    },
  );
});
