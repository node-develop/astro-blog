import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { load } from "~/lib/yaml";
import { describe, expect, it } from "vitest";

interface LandingFrontmatter {
  readonly title: string;
}

interface ArticleFrontmatter {
  readonly title: string;
  readonly description: string;
  readonly pubDate: Date;
  readonly updatedDate: Date;
  readonly tags: readonly string[];
  readonly draft: boolean;
  readonly cover: string;
  readonly summary: string;
  readonly coverAlt: string;
  readonly keywords: readonly string[];
  readonly lang: string;
  readonly sourceHash: string;
  readonly manuallyEdited: boolean;
  readonly faq?: ReadonlyArray<{ readonly question: string; readonly answer: string }>;
}

const readFrontmatter = <T>(path: string): T => {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  const yaml = source.match(/^---\s*\n([\s\S]*?)\n---/)?.[1];
  if (!yaml) throw new Error(`Missing frontmatter in ${path}`);
  return load(yaml) as T;
};

const readArticle = <T>(path: string): { readonly frontmatter: T; readonly body: string } => {
  const source = readFileSync(join(process.cwd(), path), "utf8");
  const frontmatterBlock = source.match(/^---\s*\n([\s\S]*?)\n---\n/);
  if (!frontmatterBlock?.[1]) throw new Error(`Missing frontmatter in ${path}`);
  return {
    frontmatter: load(frontmatterBlock[1]) as T,
    body: source.slice(frontmatterBlock[0].length),
  };
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

describe("English CLAUDE.md article metadata", () => {
  it("keeps localized metadata and tracks the revised Russian source", () => {
    const { frontmatter: english, body } = readArticle<ArticleFrontmatter>(
      "src/content/posts/en/claude-md-12-rules.md",
    );
    const russianPath = "src/content/posts/claude-md-12-rules.md";
    const russian = readFrontmatter<ArticleFrontmatter>(russianPath);
    const localizedText = [english.title, english.description, english.summary, english.coverAlt];

    expect(english.title).not.toBe(russian.title);
    expect(localizedText.every((value) => value.trim().length > 0)).toBe(true);
    expect(localizedText.join("\n")).not.toMatch(/[А-Яа-яЁё]/);
    expect(english.pubDate).toEqual(russian.pubDate);
    expect(english.updatedDate).toEqual(russian.updatedDate);
    expect(english.updatedDate.getTime()).toBeGreaterThan(english.pubDate.getTime());
    expect(english.sourceHash).toBe(
      createHash("sha256").update(readFileSync(russianPath, "utf8")).digest("hex"),
    );
    expect(body).toContain("https://github.com/node-develop/astro-blog");
  });
});
