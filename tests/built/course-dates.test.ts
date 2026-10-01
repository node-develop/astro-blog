import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, inject, it } from "vitest";
import { load } from "~/lib/yaml";
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
        const source = readFileSync(
          join("src/content/courses/claude-code-guide", locale === "en" ? "en" : "", file),
          "utf8",
        );
        const metadata = load(source.match(/^---\n([\s\S]*?)\n---/)![1]!) as {
          pubDate: Date;
          updatedDate?: Date;
        };
        const published = metadata.pubDate.toISOString();
        const updated = (metadata.updatedDate ?? metadata.pubDate).toISOString();
        const path = `${locale === "en" ? "/en" : ""}/courses/claude-code-guide/${file.slice(0, -3)}`;
        const response = await fetchWithTimeout(`${origin}${path}/`);
        expect(response.status, path).toBe(200);
        const html = await response.text();
        const nodes = [
          ...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g),
        ].flatMap((match) => JSON.parse(match[1]!)["@graph"]);
        const lesson = nodes.find((node) => node["@type"] === "LearningResource");
        expect(lesson.datePublished, path).toBe(published);
        expect(lesson.dateModified, path).toBe(updated);
        expect(nodes.find((node) => node["@type"] === "ItemPage").dateModified, path).toBe(updated);
        const md = await (await fetchWithTimeout(`${origin}${path}.md`)).text();
        expect(md, path).toContain(`published: ${published.slice(0, 10)}`);
        expect(md, path).toContain(`updated: ${updated.slice(0, 10)}`);
        const entry = sitemap
          .split("<url>")
          .find((item) => item.includes(`<loc>https://artka.dev${path}/</loc>`));
        expect(entry, path).toContain(`<lastmod>${updated.slice(0, 10)}</lastmod>`);
      }
    }
  });
});
