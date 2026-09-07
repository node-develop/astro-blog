import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import {
  startProductionServer,
  stopServer,
  type StartedProductionServer,
} from "../../integration/production-server.helpers";

let browser: Browser;
let server: StartedProductionServer;

beforeAll(async () => {
  server = await startProductionServer({
    host: "127.0.0.1",
    siteUrl: "https://artka.dev",
    auth: "unconfigured",
  });
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
  if (server) await stopServer(server.child);
});

const routes = [
  "/blog/claude-md-12-rules/",
  "/blog/json-ld-graph-astro/",
  "/courses/claude-code-guide/05-hooks/",
];

describe.each([375, 1440])("code readability at %ipx", (width) => {
  it.each(["light", "dark"] as const)(
    "uses the selected site theme regardless of the %s system theme",
    async (systemTheme) => {
      const context = await browser.newContext({
        viewport: { width, height: 900 },
        colorScheme: systemTheme,
      });
      try {
        const page = await context.newPage();
        for (const route of routes) {
          await page.goto(server.origin + route);
          for (const siteTheme of ["paper", "dark"]) {
            if (
              (await page.locator("html").getAttribute("data-theme")) !==
              (siteTheme === "dark" ? "dark" : null)
            ) {
              await page.locator("[data-theme-toggle]").first().click();
            }
            const blocks = await page.locator("pre.astro-code").evaluateAll((pres) => {
              const luminance = (color: string): number => {
                const values = color
                  .match(/[\d.]+/g)!
                  .slice(0, 3)
                  .map(Number)
                  .map((v) => {
                    const s = v / 255;
                    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
                  });
                return values[0]! * 0.2126 + values[1]! * 0.7152 + values[2]! * 0.0722;
              };
              return pres.map((pre) => {
                const bg = luminance(getComputedStyle(pre).backgroundColor);
                const spans = [...pre.querySelectorAll("span")];
                const contrast = spans
                  .filter((span) => span.textContent?.trim())
                  .map((span) => {
                    const fg = luminance(getComputedStyle(span).color);
                    return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
                  });
                const lines = [...pre.querySelectorAll<HTMLElement>(".line")];
                const nonempty = lines
                  .map((line, index) => ({ line, index }))
                  .filter(({ line }) => line.textContent?.trim());
                const a = nonempty[0];
                const b = nonempty[1];
                return {
                  minContrast: Math.min(...contrast),
                  backgrounds: spans.map((span) => getComputedStyle(span).backgroundColor),
                  spacing:
                    a && b
                      ? (b.line.getBoundingClientRect().top - a.line.getBoundingClientRect().top) /
                        ((b.index - a.index) * parseFloat(getComputedStyle(pre).lineHeight))
                      : 1,
                  scrolls: getComputedStyle(pre).overflowX === "auto",
                };
              });
            });
            expect(blocks.length, route).toBeGreaterThan(0);
            for (const block of blocks) {
              expect(block.minContrast, `${route} ${siteTheme}`).toBeGreaterThanOrEqual(4.5);
              expect(block.backgrounds.every((bg) => bg === "rgba(0, 0, 0, 0)")).toBe(true);
              expect(block.spacing).toBeCloseTo(1, 1);
              expect(block.scrolls).toBe(true);
            }
            expect(
              await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
            ).toBe(true);
          }
        }
      } finally {
        await context.close();
      }
    },
  );
});

it("preserves code text and empty lines when copying", async () => {
  const page = await browser.newPage();
  try {
    await page.goto(server.origin + routes[0]);
    const pre = page.locator("pre.astro-code").first();
    const expected = await pre.textContent();
    expect(expected).toContain("\n\n");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: async (text: string) => {
            document.documentElement.dataset.copiedCode = text;
          },
        },
      });
    });
    await page.locator(".code-block__copy").first().click();
    expect(await page.locator("html").getAttribute("data-copied-code")).toBe(expected);
  } finally {
    await page.close();
  }
});
