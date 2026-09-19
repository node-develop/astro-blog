import { describe, expect, it } from "vitest";
import { BLOG_PAGE_SIZE } from "~/lib/content/blog-pagination";
import {
  fetchWithTimeout,
  startProductionServer,
  stopServer,
} from "../integration/production-server.helpers";

const articleLinks = (html: string, prefix: string): string[] => [
  ...new Set(
    [...html.matchAll(/href="([^"]+)"/g)]
      .map((match) => match[1]!)
      .filter((href) => new RegExp(`^${prefix}/blog/[^/]+/$`).test(href)),
  ),
];

const mainOf = (html: string): string => html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? "";

// The archive is only as discoverable as the markup a crawler receives with no
// JavaScript: the lazy-loaded fragments carry `X-Robots-Tag: noindex` and there
// is no server-rendered link to them. So the assertions below are about the
// *rendered* first page, and they derive every boundary from BLOG_PAGE_SIZE and
// the feed itself — never from a hard-coded article count.
describe("latest publications in the built site", () => {
  it("puts every article a crawler must see into the server-rendered markup", async () => {
    const server = await startProductionServer({
      host: "127.0.0.1",
      siteUrl: "https://artka.dev",
      auth: "test",
    });
    try {
      for (const prefix of ["", "/en"]) {
        const feedResponse = await fetchWithTimeout(`${server.origin}${prefix}/feed.json`);
        expect(feedResponse.status).toBe(200);
        const feed = (await feedResponse.json()) as {
          items: { url: string; date_published: string }[];
        };
        const dates = feed.items.map((item) => Date.parse(item.date_published));
        expect(dates).toEqual([...dates].sort((a, b) => b - a));
        const feedPaths = feed.items.map((item) => new URL(item.url).pathname);
        // Fixture guard: the checks below are meaningless on a tiny archive.
        expect(feedPaths.length).toBeGreaterThan(4);

        // Homepage: whatever number of cards it shows, they are the newest
        // articles in feed order with no gaps — a post must not be skipped.
        const homeResponse = await fetchWithTimeout(`${server.origin}${prefix}/`);
        expect(homeResponse.status, `${prefix}/`).toBe(200);
        const homeLinks = articleLinks(mainOf(await homeResponse.text()), prefix);
        expect(homeLinks.length, `${prefix}/`).toBeGreaterThanOrEqual(4);
        expect(homeLinks, `${prefix}/`).toEqual(feedPaths.slice(0, homeLinks.length));

        // Archive: the whole first page is in the HTML, not behind the loader.
        const blogResponse = await fetchWithTimeout(`${server.origin}${prefix}/blog/`);
        expect(blogResponse.status, `${prefix}/blog/`).toBe(200);
        const blogHtml = await blogResponse.text();
        expect(articleLinks(mainOf(blogHtml), prefix), `${prefix}/blog/`).toEqual(
          feedPaths.slice(0, BLOG_PAGE_SIZE),
        );

        // Page 2 exists exactly when the archive outgrows one page. While it
        // fits, the index must not arm a sentinel that would fetch a 404 — and
        // nothing may be stranded behind the noindex fragments.
        const next = await fetchWithTimeout(`${server.origin}${prefix}/blog/partials/2/`);
        if (feedPaths.length > BLOG_PAGE_SIZE) {
          expect(next.status).toBe(200);
          expect(articleLinks(await next.text(), prefix)).toEqual(
            feedPaths.slice(BLOG_PAGE_SIZE, BLOG_PAGE_SIZE * 2),
          );
          expect(blogHtml).toContain("data-blog-sentinel");
        } else {
          expect(next.status).toBe(404);
          expect(blogHtml).not.toContain("data-blog-sentinel");
        }
      }
    } finally {
      await stopServer(server.child);
    }
  });
});
