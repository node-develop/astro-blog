import { describe, expect, inject, it } from "vitest";
import { CANONICAL_ORIGIN, canonicalPath, isFileLikePath } from "~/lib/seo/url-policy";
import { fetchWithTimeout } from "../support/production-server";

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

// llms-full.txt now inlines full post bodies, and posts legitimately quote
// URLs with fragments/queries inside code (e.g. `https://artka.dev/#person`
// in the JSON-LD article). Only URLs outside code spans/blocks are the
// site's own emitted links and must follow the canonical policy.
// Fences are matched line-anchored: prose can mention "```mermaid" inline,
// which would otherwise desync fence pairing for every later post.
const stripCode = (text: string): string =>
  text.replace(/^\s*```[\s\S]*?^\s*```[^\n]*$/gm, " ").replace(/`[^`\n]*`/g, " ");

const internalUrls = (text: string): URL[] =>
  [...stripCode(text).matchAll(/https?:\/\/(?:www\.)?artka\.dev[^\s<>"'`]*/gi)].map(
    ([match]) => new URL(match.replace(/[\])},.;:!?]+$/g, "")),
  );

const origin = inject("siteOrigin");

describe("built utility routes", () => {
  it("serves crawlable noindex pages and localized English search UI", async () => {
    const searchHtml = await fetchBuiltRoute(origin, "/search/");
    const enSearchHtml = await fetchBuiltRoute(origin, "/en/search/");
    const loginHtml = await fetchBuiltRoute(origin, "/login/");
    const llmsFull = await fetchBuiltResponse(origin, "/llms-full.txt");

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
        // `toEndWith` is not a Vitest matcher; this branch was never reached
        // before llms-full.txt started listing per-post `.md` twins.
        expect(url.pathname.endsWith("/"), url.toString()).toBe(false);
      } else {
        expect(url.pathname === "/" || url.pathname.endsWith("/"), url.toString()).toBe(true);
      }
    }

    expect(enSearchHtml).toMatch(/<h1\b[^>]*>\s*Search\s*<\/h1>/);
    expect(enSearchHtml).toContain('action="/en/search/"');
    expect(enSearchHtml).toContain('placeholder="Search…"');
    expect(enSearchHtml).toContain('aria-label="Search query"');
    expect(enSearchHtml).toContain("Enter a query or press");
  });

  // A prerendered twin was a bare file with no headers, so a search engine that
  // crawled one had no signal to drop it. Each twin must name its HTML page as
  // canonical and opt out of the index, and only a served response shows that.
  it("serves Markdown twins as noindex duplicates of their canonical HTML page", async () => {
    // llms.txt names the RU post and lesson twins (and EN lessons); llms-full.txt
    // names a twin for every post in both languages.
    const llms = [
      await fetchBuiltRoute(origin, "/llms.txt"),
      await fetchBuiltRoute(origin, "/llms-full.txt"),
    ].join("\n");
    const twinUrls = [...llms.matchAll(/Markdown: (https:\/\/artka\.dev\/[^\s)]+\.md)/g)].map(
      ([, url]) => new URL(url!),
    );
    const samples = [
      twinUrls.find((url) => url.pathname.startsWith("/blog/")),
      twinUrls.find((url) => url.pathname.startsWith("/en/blog/")),
      twinUrls.find((url) => url.pathname.startsWith("/courses/")),
      twinUrls.find((url) => url.pathname.startsWith("/en/courses/")),
    ];

    for (const sample of samples) {
      expect(sample, "the llms files list a twin of each kind").toBeDefined();
      const twin = await fetchBuiltResponse(origin, sample!.pathname);
      const canonical = `${CANONICAL_ORIGIN}${sample!.pathname.slice(0, -".md".length)}/`;
      expect(twin.response.status, sample!.pathname).toBe(200);
      expect(twin.response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
      expect(twin.response.headers.get("x-robots-tag"), sample!.pathname).toBe("noindex");
      expect(twin.response.headers.get("link"), sample!.pathname).toBe(
        `<${canonical}>; rel="canonical"`,
      );
      expect(twin.body, sample!.pathname).toContain(`canonical: ${canonical}`);
    }

    for (const missing of [
      "/blog/__missing-twin__.md",
      "/en/blog/__missing-twin__.md",
      "/courses/claude-code-guide/__missing-twin__.md",
      "/en/courses/claude-code-guide/__missing-twin__.md",
    ]) {
      const response = await fetchWithTimeout(`${origin}${missing}`, { redirect: "manual" });
      await response.body?.cancel();
      expect(response.status, missing).toBe(404);
    }
  });
});
