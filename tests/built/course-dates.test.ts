import { readdirSync } from "node:fs";
import { describe, expect, inject, it } from "vitest";
import { fetchWithTimeout } from "../support/production-server";

const origin = inject("siteOrigin");

describe("published course revision dates", () => {
  it("preserves publication and exposes revision dates in HTML, Markdown and sitemaps", async () => {
    const lessons = readdirSync("src/content/courses/claude-code-guide").filter((name) =>
      /^\d\d-.*\.md$/.test(name),
    );
    expect(lessons).toHaveLength(14);
    for (const locale of ["ru", "en"]) {
      const sitemap = await (await fetchWithTimeout(`${origin}/sitemap-${locale}.xml`)).text();
      for (const file of lessons) {
        const path = `${locale === "en" ? "/en" : ""}/courses/claude-code-guide/${file.slice(0, -3)}`;
        const response = await fetchWithTimeout(`${origin}${path}/`);
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
        const md = await (await fetchWithTimeout(`${origin}${path}.md`)).text();
        expect(md, path).toContain("published: 2026-04-23");
        expect(md, path).toContain("updated: 2026-09-08");
        const entry = sitemap
          .split("<url>")
          .find((item) => item.includes(`<loc>https://artka.dev${path}/</loc>`));
        expect(entry, path).toContain("<lastmod>2026-09-08</lastmod>");
      }
    }
  });
});
