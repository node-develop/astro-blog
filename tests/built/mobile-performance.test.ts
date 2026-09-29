import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { chromium, type Browser } from "playwright";

const origin = inject("siteOrigin");
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

describe.each(["/", "/en/"])("mobile first screen on %s", (path) => {
  it("paints the hero without blocking stylesheets or entrance animations", async () => {
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      reducedMotion: "no-preference",
    });
    try {
      // Third-party availability is unrelated to the first-party CSS contract.
      await context.route(/https:\/\/(www\.googletagmanager\.com|plausible\.io)\//, (route) =>
        route.abort(),
      );
      const page = await context.newPage();
      await page.goto(origin + path, { waitUntil: "domcontentloaded" });
      expect(await page.locator('link[rel="stylesheet"]').count()).toBe(0);
      const title = await page.locator(".masthead__title").evaluate((element) => {
        const style = getComputedStyle(element);
        return { animation: style.animationName, transform: style.transform };
      });
      const foot = await page.locator(".masthead__foot").evaluate((element) => {
        const style = getComputedStyle(element);
        return { animation: style.animationName, opacity: style.opacity };
      });
      expect(title).toEqual({ animation: "none", transform: "none" });
      expect(foot).toEqual({ animation: "none", opacity: "1" });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);
    } finally {
      await context.close();
    }
  });
});
