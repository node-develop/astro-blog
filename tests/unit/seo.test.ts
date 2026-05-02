import { describe, it, expect } from "vitest";
import { readFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (rel: string) => readFile(`${root}${rel}`, "utf8");
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

  it("emits WebSite JSON-LD", async () => {
    const src = await read("src/layouts/BaseLayout.astro");
    expect(src).toMatch(/application\/ld\+json/);
    expect(src).toMatch(/"@type":\s*"WebSite"/);
  });

  it("supports noindex prop", async () => {
    const src = await read("src/layouts/BaseLayout.astro");
    expect(src).toMatch(/noindex/);
    expect(src).toMatch(/noindex,nofollow/);
  });
});

describe("SEO: PostLayout meta", () => {
  it("emits BlogPosting JSON-LD with all required fields", async () => {
    const src = await read("src/layouts/PostLayout.astro");
    expect(src).toMatch(/"@type":\s*"BlogPosting"/);
    expect(src).toMatch(/headline/);
    expect(src).toMatch(/datePublished/);
    expect(src).toMatch(/dateModified/);
    expect(src).toMatch(/mainEntityOfPage/);
    expect(src).toMatch(/inLanguage/);
  });

  it("emits BreadcrumbList JSON-LD", async () => {
    const src = await read("src/layouts/PostLayout.astro");
    expect(src).toMatch(/"@type":\s*"BreadcrumbList"/);
    expect(src).toMatch(/itemListElement/);
  });

  it("emits article-specific OG meta", async () => {
    const src = await read("src/layouts/PostLayout.astro");
    expect(src).toMatch(/article:published_time/);
    expect(src).toMatch(/article:author/);
    expect(src).toMatch(/article:tag/);
  });
});

describe("SEO: RSS feeds", () => {
  it("RU rss includes content, author, categories, language", async () => {
    const src = await read("src/pages/rss.xml.ts");
    expect(src).toMatch(/MarkdownIt/);
    expect(src).toMatch(/content:.*parser\.render/);
    expect(src).toMatch(/author:/);
    expect(src).toMatch(/categories:/);
    expect(src).toMatch(/<language>ru-RU<\/language>/);
  });

  it("EN rss uses en-US locale", async () => {
    const src = await read("src/pages/en/rss.xml.ts");
    expect(src).toMatch(/<language>en-US<\/language>/);
    expect(src).toMatch(/\/en\/blog\//);
  });
});

describe("SEO: i18n descriptions", () => {
  it("RU strings include meta descriptions", async () => {
    const json = JSON.parse(await read("src/i18n/strings.ru.json"));
    expect(json["meta.home.description"]).toBeTruthy();
    expect(json["meta.about.description"]).toBeTruthy();
    expect(json["meta.home.description"].length).toBeGreaterThan(20);
  });

  it("EN strings include meta descriptions", async () => {
    const json = JSON.parse(await read("src/i18n/strings.en.json"));
    expect(json["meta.home.description"]).toBeTruthy();
    expect(json["meta.about.description"]).toBeTruthy();
  });

  it("EN home description is in English (no Cyrillic)", async () => {
    const json = JSON.parse(await read("src/i18n/strings.en.json"));
    expect(json["meta.home.description"]).not.toMatch(/[а-яА-ЯёЁ]/);
    expect(json["meta.about.description"]).not.toMatch(/[а-яА-ЯёЁ]/);
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
