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

describe.each([375, 1440])("theme navigation at %ipx", (width) => {
  it.each(["light", "dark"] as const)(
    "preserves both choices with a %s system theme",
    async (colorScheme) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      try {
        const page = await context.newPage();
        // Keep the navigation test independent of the production avatar host.
        await page.route("https://artka.dev/avatar-512.png", (route) =>
          route.fulfill({ path: "dist/client/avatar-512.png", contentType: "image/png" }),
        );
        const swaps: string[] = [];
        await page.exposeFunction("recordThemeSwap", (theme: string) => swaps.push(theme));
        await page.addInitScript(() => {
          document.addEventListener("astro:after-swap", () => {
            const target = window as typeof window & {
              recordThemeSwap: (theme: string) => Promise<void>;
            };
            void target.recordThemeSwap(document.documentElement.dataset.theme ?? "paper");
          });
        });
        await page.goto(origin + "/about/");
        for (const theme of ["dark", "paper"]) {
          const current = (await page.locator("html").getAttribute("data-theme")) ?? "paper";
          if (current === theme) await page.locator("[data-theme-toggle]").first().click();
          await page.locator("[data-theme-toggle]").first().click();
          swaps.length = 0;
          let expectedSwaps = 0;
          for (const route of ["/now/", "/uses/", "/about/"]) {
            await page.locator(`.site-footer a[href="${route}"]`).click();
            await page.waitForURL(origin + route);
            await expect.poll(() => swaps.length).toBe(++expectedSwaps);
            expect((await page.locator("html").getAttribute("data-theme")) ?? "paper").toBe(theme);
          }
          await page.goBack();
          await page.waitForURL(origin + "/uses/");
          await expect.poll(() => swaps.length).toBe(4);
          await page.goForward();
          await page.waitForURL(origin + "/about/");
          await expect.poll(() => swaps.length).toBe(5);
          expect(swaps).toEqual(Array(5).fill(theme));
          await page.reload();
          expect((await page.locator("html").getAttribute("data-theme")) ?? "paper").toBe(theme);
          expect(await page.evaluate(() => localStorage.getItem("artka-theme"))).toBe(theme);
        }
      } finally {
        await context.close();
      }
    },
  );
});

it("preserves the in-memory choice during navigation when storage is blocked", async () => {
  const context = await browser.newContext({ colorScheme: "light" });
  try {
    await context.addInitScript(() => {
      Object.defineProperty(Storage.prototype, "getItem", {
        value: () => {
          throw new Error("blocked");
        },
      });
      Object.defineProperty(Storage.prototype, "setItem", {
        value: () => {
          throw new Error("blocked");
        },
      });
    });
    const page = await context.newPage();
    // Keep the navigation test independent of the production avatar host.
    await page.route("https://artka.dev/avatar-512.png", (route) =>
      route.fulfill({ path: "dist/client/avatar-512.png", contentType: "image/png" }),
    );
    await page.goto(origin + "/about/");
    await page.locator("[data-theme-toggle]").first().click();
    await page.locator('.site-footer a[href="/now/"]').click();
    await page.waitForURL(origin + "/now/");
    expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
  } finally {
    await context.close();
  }
});

it.each([375, 1440])(
  "switches blog language both ways without resetting dark mode at %ipx",
  async (width) => {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: "light",
    });
    try {
      const page = await context.newPage();
      // Keep the navigation test independent of the production avatar host.
      await page.route("https://artka.dev/avatar-512.png", (route) =>
        route.fulfill({ path: "dist/client/avatar-512.png", contentType: "image/png" }),
      );
      await page.goto(origin + "/blog/");
      await page.locator("[data-theme-toggle]").first().click();
      for (const route of ["/en/blog/", "/blog/"]) {
        const toggle = page.locator(".site-header__actions .lang-toggle");
        expect(await toggle.getAttribute("href")).toBe(route);
        expect(
          await page.locator(`link[rel="alternate"][href="https://artka.dev${route}"]`).count(),
        ).toBeGreaterThan(0);
        await toggle.click();
        await page.waitForURL(origin + route);
        await expect
          .poll(async () => await page.locator("html").getAttribute("lang"))
          .toBe(route.startsWith("/en/") ? "en" : "ru");
        expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
      }
    } finally {
      await context.close();
    }
  },
);
