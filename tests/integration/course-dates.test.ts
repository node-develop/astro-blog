import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { startProductionServer, stopServer, fetchWithTimeout } from "./production-server.helpers";

describe("published course revision dates", () => {
  it("preserves publication and exposes revision dates in HTML, Markdown and sitemaps", async () => {
    const server = await startProductionServer({
      host: "127.0.0.1",
      siteUrl: "https://artka.dev",
      auth: "test",
    });
    try {
      const lessons = readdirSync("src/content/courses/claude-code-guide").filter((name) =>
        /^\d\d-.*\.md$/.test(name),
      );
      expect(lessons).toHaveLength(14);
      for (const locale of ["ru", "en"]) {
        const sitemap = await (
          await fetchWithTimeout(`${server.origin}/sitemap-${locale}.xml`)
        ).text();
        for (const file of lessons) {
          const path = `${locale === "en" ? "/en" : ""}/courses/claude-code-guide/${file.slice(0, -3)}`;
          const response = await fetchWithTimeout(`${server.origin}${path}/`);
          expect(response.status, path).toBe(200);
          const html = await response.text();
          const nodes = [
            ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
          ].flatMap((match) => JSON.parse(match[1]!)["@graph"]);
          const lesson = nodes.find((node) => node["@type"] === "LearningResource");
          expect(lesson.datePublished, path).toBe("2026-04-23T00:00:00.000Z");
          expect(lesson.dateModified, path).toBe("2026-09-08T00:00:00.000Z");
          expect(nodes.find((node) => node["@type"] === "ItemPage").dateModified, path).toBe(
            "2026-09-08T00:00:00.000Z",
          );
          const md = await (await fetchWithTimeout(`${server.origin}${path}.md`)).text();
          expect(md, path).toContain("published: 2026-04-23");
          expect(md, path).toContain("updated: 2026-09-08");
          const entry = sitemap
            .split("<url>")
            .find((item) => item.includes(`<loc>https://artka.dev${path}/</loc>`));
          expect(entry, path).toContain("<lastmod>2026-09-08</lastmod>");
        }
      }
    } finally {
      await stopServer(server.child);
    }
  });
});
