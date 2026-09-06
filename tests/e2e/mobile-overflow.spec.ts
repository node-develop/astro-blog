import { test, expect } from "@playwright/test";

const PAGES = [
  "/",
  "/blog",
  "/blog/local-coding-agent",
  "/blog/robots-txt-ai-crawlers-2026",
  "/blog/mermaid-svg-playwright-build-time",
  "/blog/json-ld-graph-astro",
  "/about",
  "/now",
  "/uses",
  "/projects",
  "/projects/astro-blog",
  "/tags",
  "/tags/claude-code",
];

test.describe("mobile viewport — no horizontal overflow", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const path of PAGES) {
    test(`page ${path} fits within 375px width`, async ({ page }) => {
      await page.goto(path);
      const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const viewportWidth = page.viewportSize()!.width;
      expect(docWidth).toBeLessThanOrEqual(viewportWidth + 1);
    });
  }
});

test.describe("iphone-se (320px)", () => {
  test.use({ viewport: { width: 320, height: 568 } });

  test("homepage fits", async ({ page }) => {
    await page.goto("/");
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(321);
  });

  test("authority article fits", async ({ page }) => {
    await page.goto("/blog/robots-txt-ai-crawlers-2026/");
    const docWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(docWidth).toBeLessThanOrEqual(321);
  });
});
