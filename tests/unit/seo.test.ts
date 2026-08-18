import { describe, it, expect } from "vitest";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFile(`${root}${rel}`, "utf8");

const readFrontmatterValue = (md: string, key: string): string => {
  const m = /^---\n([\s\S]+?)\n---/.exec(md);
  if (!m) return "";
  const fm = yaml.load(m[1]!) as Record<string, unknown> | null;
  const v = fm?.[key];
  return typeof v === "string" ? v : "";
};
const exists = async (rel: string) => {
  try {
    await access(`${root}${rel}`);
    return true;
  } catch {
    return false;
  }
};

describe("SEO: public assets", () => {
  it("robots.txt is present and points at sitemap-index.xml", async () => {
    const txt = await read("public/robots.txt");
    expect(txt).toMatch(/User-agent:\s*\*/);
    expect(txt).toMatch(/Disallow:\s*\/admin/);
    expect(txt).toMatch(/Sitemap:\s*https?:\/\/[^\s]+sitemap-index\.xml/);
  });

  it("favicon.svg exists", async () => {
    expect(await exists("public/favicon.svg")).toBe(true);
  });

  it("og-default.svg exists with 1200x630 viewbox", async () => {
    const svg = await read("public/og-default.svg");
    expect(svg).toMatch(/viewBox=["']0 0 1200 630["']/);
  });
});

describe("SEO: BaseLayout meta", () => {
  it("emits canonical, og:url, og:site_name, twitter:card, theme-color", async () => {
    const src = await read("src/layouts/BaseLayout.astro");
    expect(src).toMatch(/rel="canonical"/);
    expect(src).toMatch(/property="og:url"/);
    expect(src).toMatch(/property="og:site_name"/);
    expect(src).toMatch(/name="twitter:card"/);
    expect(src).toMatch(/name="theme-color"/);
    expect(src).toMatch(/rel="apple-touch-icon"/);
  });

  it("emits hreflang only when counterpart exists", async () => {
    const src = await read("src/layouts/BaseLayout.astro");
    expect(src).toMatch(/counterpartExists/);
    expect(src).toMatch(/hreflang="x-default"/);
  });

  it("emits WebSite JSON-LD via buildGraph", async () => {
    const src = await read("src/layouts/BaseLayout.astro");
    expect(src).toMatch(/application\/ld\+json/);
    expect(src).toMatch(/buildGraph/);
  });

  it("supports noindex prop", async () => {
    const src = await read("src/layouts/BaseLayout.astro");
    expect(src).toMatch(/noindex/);
    expect(src).toMatch(/noindex,nofollow/);
  });
});

describe("SEO: PostLayout meta", () => {
  it("passes BlogPosting and BreadcrumbList nodes via extraSchemaNodes", async () => {
    const src = await read("src/layouts/PostLayout.astro");
    expect(src).toMatch(/buildBlogPostingNode/);
    expect(src).toMatch(/buildBreadcrumbListNode/);
    expect(src).toMatch(/extraSchemaNodes/);
  });

  it("emits article-specific OG meta", async () => {
    const src = await read("src/layouts/PostLayout.astro");
    expect(src).toMatch(/article:published_time/);
    expect(src).toMatch(/article:author/);
    expect(src).toMatch(/article:tag/);
  });
});

describe("SEO: RSS feeds", () => {
  it("shared feed builder includes content, author, categories, both languages", async () => {
    const src = await read("src/lib/feeds/build-rss.ts");
    expect(src).toMatch(/MarkdownIt/);
    expect(src).toMatch(/content:.*renderContent/);
    expect(src).toMatch(/canonicalInternalHref/);
    expect(src).toMatch(/author:/);
    expect(src).toMatch(/categories:/);
    expect(src).toMatch(/<language>\$\{lang\}<\/language>/);
    expect(src).toMatch(/locale === "ru" \? "ru-RU" : "en-US"/);
    expect(src).toMatch(/\/en\/blog/);
  });

  it("RU and EN rss endpoints both delegate to the shared builder", async () => {
    const ru = await read("src/pages/rss.xml.ts");
    const en = await read("src/pages/en/rss.xml.ts");
    expect(ru).toMatch(/buildRssFeed.*locale: "ru"/s);
    expect(en).toMatch(/buildRssFeed.*locale: "en"/s);
  });
});

describe("SEO: i18n descriptions", () => {
  it("RU strings include meta.about description", async () => {
    const json = JSON.parse(await read("src/i18n/strings.ru.json"));
    expect(json["meta.about.description"]).toBeTruthy();
  });

  it("EN strings include meta.about description in English (no Cyrillic)", async () => {
    const json = JSON.parse(await read("src/i18n/strings.en.json"));
    expect(json["meta.about.description"]).toBeTruthy();
    expect(json["meta.about.description"]).not.toMatch(/[а-яА-ЯёЁ]/);
  });

  it("home.md frontmatter has metaDescription (RU)", async () => {
    const md = await read("src/content/site/home.md");
    const value = readFrontmatterValue(md, "metaDescription");
    expect(value).toBeTruthy();
    expect(value.length).toBeGreaterThan(20);
  });

  it("en/home.md frontmatter has metaDescription in English (no Cyrillic)", async () => {
    const md = await read("src/content/site/en/home.md");
    const value = readFrontmatterValue(md, "metaDescription");
    expect(value).toBeTruthy();
    expect(value).not.toMatch(/[а-яА-ЯёЁ]/);
  });
});

describe("SEO: content schema", () => {
  it("posts schema declares author with default", async () => {
    const src = await read("src/content.config.ts");
    expect(src).toMatch(/author:\s*z\.string\(\)\.default/);
  });

  it("site schema declares optional description", async () => {
    const src = await read("src/content.config.ts");
    expect(src).toMatch(/description:\s*z\.string\(\)/);
  });
});
