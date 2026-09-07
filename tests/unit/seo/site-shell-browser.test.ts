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
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
  if (server) await stopServer(server.child);
});

describe.each([375, 1440])("theme navigation at %ipx", (width) => {
  it.each(["light", "dark"] as const)(
    "preserves both choices with a %s system theme",
    async (colorScheme) => {
      const context = await browser.newContext({ viewport: { width, height: 900 }, colorScheme });
      try {
        const page = await context.newPage();
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
        await page.goto(server.origin + "/about/");
        for (const theme of ["dark", "paper"]) {
          const current = (await page.locator("html").getAttribute("data-theme")) ?? "paper";
          if (current === theme) await page.locator("[data-theme-toggle]").first().click();
          await page.locator("[data-theme-toggle]").first().click();
          swaps.length = 0;
          let expectedSwaps = 0;
          for (const route of ["/now/", "/uses/", "/about/"]) {
            await page.locator(`.site-footer a[href="${route}"]`).click();
            await page.waitForURL(server.origin + route);
            await expect.poll(() => swaps.length).toBe(++expectedSwaps);
            expect((await page.locator("html").getAttribute("data-theme")) ?? "paper").toBe(theme);
          }
          await page.goBack();
          await page.waitForURL(server.origin + "/uses/");
          await expect.poll(() => swaps.length).toBe(4);
          await page.goForward();
          await page.waitForURL(server.origin + "/about/");
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
    await page.goto(server.origin + "/about/");
    await page.locator("[data-theme-toggle]").first().click();
    await page.locator('.site-footer a[href="/now/"]').click();
    await page.waitForURL(server.origin + "/now/");
    expect(await page.locator("html").getAttribute("data-theme")).toBe("dark");
  } finally {
    await context.close();
  }
});

it.each([320, 375, 768, 1024, 1440])(
  "keeps the header and footer compact at %ipx",
  async (width) => {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    try {
      await page.goto(server.origin + "/about/");
      const footer = page.locator(".site-footer");
      expect(await footer.locator("a").count()).toBeGreaterThan(10);
      expect(await footer.locator(".site-footer__legal, .site-footer__meta").count()).toBe(0);
      expect(await footer.innerText()).not.toMatch(/WCAG|static-first|view-transitions|©/i);
      expect(await footer.evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(
        width < 768 ? 450 : 330,
      );
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      if (width < 1024) {
        const menu = page.locator("[data-drawer-trigger]");
        const box = (await menu.boundingBox())!;
        const actions = (await page.locator(".site-header__actions").boundingBox())!;
        expect(width - box.x - box.width).toBeCloseTo(width < 768 ? 16 : 24, 0);
        expect(box.x - actions.x - actions.width).toBeGreaterThanOrEqual(16);
        expect(box.width).toBeGreaterThanOrEqual(44);
        await menu.click();
        expect(await menu.getAttribute("aria-expanded")).toBe("true");
        await page.keyboard.press("Escape");
        expect(await menu.getAttribute("aria-expanded")).toBe("false");
      }
    } finally {
      await page.close();
    }
  },
);

it.each([375, 1440])(
  "switches blog language both ways without resetting dark mode at %ipx",
  async (width) => {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      colorScheme: "light",
    });
    try {
      const page = await context.newPage();
      await page.goto(server.origin + "/blog/");
      await page.locator("[data-theme-toggle]").first().click();
      for (const route of ["/en/blog/", "/blog/"]) {
        const toggle = page.locator(".site-header__actions .lang-toggle");
        expect(await toggle.getAttribute("href")).toBe(route);
        expect(
          await page.locator(`link[rel="alternate"][href="https://artka.dev${route}"]`).count(),
        ).toBeGreaterThan(0);
        await toggle.click();
        await page.waitForURL(server.origin + route);
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
