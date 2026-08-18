import { describe, expect, it } from "vitest";
import { CANONICAL_ORIGIN, canonicalPath, isFileLikePath } from "~/lib/seo/url-policy";
import { fetchWithTimeout, startProductionServer, stopServer } from "./production-server.helpers";

const fetchBuiltResponse = async (
  origin: string,
  path: string,
): Promise<{ readonly response: Response; readonly body: string }> => {
  const response = await fetchWithTimeout(`${origin}${path}`, { redirect: "follow" });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}:\n${body.slice(0, 1_000)}`);
  }
  return { response, body };
};

const fetchBuiltRoute = async (origin: string, path: string): Promise<string> =>
  (await fetchBuiltResponse(origin, path)).body;

const metaContent = (html: string, name: string): string | undefined => {
  const tag = html.match(new RegExp(`<meta\\b(?=[^>]*\\bname=["']${name}["'])[^>]*>`, "i"))?.[0];
  return tag?.match(/\bcontent=["']([^"']+)["']/i)?.[1];
};

const internalUrls = (text: string): URL[] =>
  [...text.matchAll(/https?:\/\/(?:www\.)?artka\.dev[^\s<>"']*/gi)].map(
    ([match]) => new URL(match.replace(/[\])},.;:!?]+$/g, "")),
  );

describe("built utility routes", () => {
  it("serves crawlable noindex pages and localized English search UI", async () => {
    const server = await startProductionServer({
      host: "127.0.0.1",
      siteUrl: "https://artka.dev",
      auth: "test",
    });

    try {
      const searchHtml = await fetchBuiltRoute(server.origin, "/search/");
      const enSearchHtml = await fetchBuiltRoute(server.origin, "/en/search/");
      const loginHtml = await fetchBuiltRoute(server.origin, "/login/");
      const llmsFull = await fetchBuiltResponse(server.origin, "/llms-full.txt");

      expect(metaContent(searchHtml, "robots")).toBe("noindex,follow");
      expect(metaContent(enSearchHtml, "robots")).toBe("noindex,follow");
      expect(metaContent(loginHtml, "robots")).toBe("noindex,follow");

      expect(llmsFull.response.status).toBe(200);
      expect(llmsFull.response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
      expect(llmsFull.response.headers.get("x-robots-tag")).toBe("noindex");
      expect(llmsFull.body).toContain("# artka.dev — full LLM digest");

      const llmsUrls = internalUrls(llmsFull.body);
      expect(llmsUrls.length).toBeGreaterThan(0);
      for (const url of llmsUrls) {
        expect(url.origin, url.toString()).toBe(CANONICAL_ORIGIN);
        expect(url.search, url.toString()).toBe("");
        expect(url.hash, url.toString()).toBe("");
        expect(url.pathname, url.toString()).toBe(canonicalPath(url.pathname));
        if (isFileLikePath(url.pathname)) {
          expect(url.pathname, url.toString()).not.toEndWith("/");
        } else {
          expect(url.pathname === "/" || url.pathname.endsWith("/"), url.toString()).toBe(true);
        }
      }

      expect(enSearchHtml).toMatch(/<h1\b[^>]*>\s*Search\s*<\/h1>/);
      expect(enSearchHtml).toContain('action="/en/search/"');
      expect(enSearchHtml).toContain('placeholder="Search…"');
      expect(enSearchHtml).toContain('aria-label="Search query"');
      expect(enSearchHtml).toContain("Enter a query or press");
    } finally {
      await stopServer(server.child);
    }
  });
});
