import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "~/lib/yaml";
import { describe, expect, it } from "vitest";

interface LandingFrontmatter {
  readonly title: string;
}

const readFrontmatter = <T>(path: string): T => {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  const yaml = source.match(/^---\s*\n([\s\S]*?)\n---/)?.[1];
  if (!yaml) throw new Error(`Missing frontmatter in ${path}`);
  return load(yaml) as T;
};

const visibleText = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replace(/\s+/g, " ")
    .trim();

describe("landing page headings", () => {
  const routes = [
    { route: "about", entry: "src/content/site/about.md" },
    { route: "en/about", entry: "src/content/site/en/about.md" },
    { route: "uses", entry: "src/content/site/uses.md" },
    { route: "en/uses", entry: "src/content/site/en/uses.md" },
    { route: "now", entry: "src/content/site/now.md" },
    { route: "en/now", entry: "src/content/site/en/now.md" },
  ] as const;

  it.each(routes)(
    "renders exactly one visible content-title H1 on /$route/",
    ({ route, entry }) => {
      const html = readFileSync(join(process.cwd(), "dist/client", route, "index.html"), "utf8");
      const headings = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) =>
        visibleText(match[1] ?? ""),
      );
      const frontmatter = readFrontmatter<LandingFrontmatter>(entry);

      expect(headings).toEqual([frontmatter.title]);
    },
  );
});
