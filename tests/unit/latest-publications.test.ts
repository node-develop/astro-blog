import { describe, expect, it } from "vitest";
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

describe("latest publications in the built site", () => {
  it("shows the newest articles in both homepages, archives and subsequent pages", async () => {
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
        const expected = feed.items.slice(0, 8).map((item) => new URL(item.url).pathname);
        expect(expected.length).toBeGreaterThan(4);
        for (const path of [`${prefix}/`, `${prefix}/blog/`]) {
          const response = await fetchWithTimeout(`${server.origin}${path}`);
          expect(response.status, path).toBe(200);
          const html = await response.text();
          const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? "";
          expect(articleLinks(main, prefix).slice(0, 4), path).toEqual(expected.slice(0, 4));
        }
        const next = await fetchWithTimeout(`${server.origin}${prefix}/blog/partials/2/`);
        expect(next.status).toBe(200);
        expect(articleLinks(await next.text(), prefix)).toEqual(expected.slice(4, 8));
      }
    } finally {
      await stopServer(server.child);
    }
  });
});
