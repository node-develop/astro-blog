import { expect, test, type Page } from "@playwright/test";

type LdNode = Record<string, unknown> & {
  readonly "@type"?: string | readonly string[];
  readonly "@id"?: string;
};

/** Flattens every ld+json script on the page into its @graph nodes. */
const ldNodes = async (page: Page): Promise<readonly LdNode[]> => {
  const scripts = await page.locator('script[type="application/ld+json"]').allTextContents();
  return scripts.flatMap((raw) => {
    const parsed = JSON.parse(raw) as LdNode & { readonly "@graph"?: readonly LdNode[] };
    return Array.isArray(parsed["@graph"]) ? parsed["@graph"] : [parsed];
  });
};

const hasType = (node: LdNode, type: string): boolean =>
  Array.isArray(node["@type"]) ? node["@type"].includes(type) : node["@type"] === type;

/** Follows a `{ "@id": … }` reference to its graph node; inline objects pass through. */
const resolveRef = (nodes: readonly LdNode[], ref: unknown): LdNode | undefined => {
  if (!ref || typeof ref !== "object") return undefined;
  const id = (ref as LdNode)["@id"];
  if (typeof id !== "string") return ref as LdNode;
  return nodes.find((node) => node["@id"] === id) ?? (ref as LdNode);
};

test.describe("SEO: static assets and feeds", () => {
  test("/robots.txt is served and points at sitemap", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/User-agent:\s*\*/);
    expect(body).toMatch(/Sitemap:\s+https?:\/\/[^\s]+sitemap-index\.xml/);
  });

  test("/sitemap-index.xml is generated", async ({ request }) => {
    const res = await request.get("/sitemap-index.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("<sitemap>");
    expect(body).toContain("sitemap-ru.xml");
    expect(body).toContain("sitemap-en.xml");
    expect(body).not.toContain("sitemap-0.xml");
    expect(body).toContain("<lastmod>");
  });

  test("/favicon.svg exists", async ({ request }) => {
    const res = await request.get("/favicon.svg");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/svg/);
  });

  test("/og-default.svg exists with 1200x630 viewBox", async ({ request }) => {
    const res = await request.get("/og-default.svg");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toMatch(/viewBox=["']0 0 1200 630["']/);
  });

  test("/rss.xml has author + category + content:encoded", async ({ request }) => {
    const res = await request.get("/rss.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("<language>ru-RU</language>");
    expect(body).toContain("<author>a@artka.dev");
    expect(body).toContain("<category>");
    expect(body).toContain("<content:encoded>");
  });

  test("/en/rss.xml uses en-US locale", async ({ request }) => {
    const res = await request.get("/en/rss.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("<language>en-US</language>");
  });
});

test.describe("SEO: meta tags on rendered pages", () => {
  test("home (RU) emits canonical, og:url, og:site_name, WebSite JSON-LD", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:url"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      "artka.dev",
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    // BaseLayout splits theme-color into light/dark variants (media queries) so
    // the iOS Safari address bar follows the active colour scheme.
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveCount(2);
    await expect(themeColor.nth(0)).toHaveAttribute("media", "(prefers-color-scheme: light)");
    await expect(themeColor.nth(1)).toHaveAttribute("media", "(prefers-color-scheme: dark)");

    const website = (await ldNodes(page)).find((node) => hasType(node, "WebSite"));
    expect(website).toBeDefined();
    expect(website?.inLanguage).toBe("ru-RU");
  });

  test("post page emits BlogPosting + BreadcrumbList + article meta", async ({ page }) => {
    await page.goto("/blog/local-coding-agent/");

    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "article");
    await expect(page.locator('meta[property="article:published_time"]')).toHaveCount(1);
    await expect(page.locator('meta[property="article:author"]')).toHaveCount(1);

    // One @graph per page: BlogPosting points at #person / #brand by @id.
    const nodes = await ldNodes(page);
    const blogPosting = nodes.find((node) => hasType(node, "BlogPosting"));
    expect(blogPosting).toBeDefined();
    expect(nodes.some((node) => hasType(node, "BreadcrumbList"))).toBe(true);
    expect(blogPosting?.headline).toBeTruthy();
    expect(blogPosting?.datePublished).toBeTruthy();
    expect(resolveRef(nodes, blogPosting?.author)?.name).toBeTruthy();
    expect(resolveRef(nodes, blogPosting?.publisher)?.name).toBe("artka.dev");
  });

  test("hreflang only emitted when EN counterpart exists", async ({ page }) => {
    await page.goto("/blog/local-coding-agent/");
    const ru = page.locator('link[rel="alternate"][hreflang="ru-RU"]');
    const en = page.locator('link[rel="alternate"][hreflang="en-US"]');
    const xDefault = page.locator('link[rel="alternate"][hreflang="x-default"]');
    await expect(ru).toHaveCount(1);
    await expect(en).toHaveCount(1);
    await expect(xDefault).toHaveCount(1);
  });

  test("login has no locale alternates", async ({ page }) => {
    await page.goto("/login/");
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
  });
});
