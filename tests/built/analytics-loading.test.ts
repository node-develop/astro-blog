import { afterAll, beforeAll, expect, inject, it } from "vitest";
import { chromium, type Browser } from "playwright";

const origin = inject("siteOrigin");
let browser: Browser;
beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser?.close();
});

it("queues the landing page and loads GA once after load and idle, including navigation", async () => {
  const context = await browser.newContext();
  try {
    let requests = 0;
    await context.route("https://www.googletagmanager.com/gtag/js?*", (route) => {
      requests++;
      return route.fulfill({ body: "", contentType: "text/javascript" });
    });
    await context.addInitScript(() => {
      const callbacks: (() => void)[] = [];
      Object.assign(window, {
        requestIdleCallback: (callback: () => void) => callbacks.push(callback),
        flushTestIdle: () => callbacks.splice(0).forEach((callback) => callback()),
      });
    });
    const page = await context.newPage();
    await page.goto(origin + "/");
    expect(requests).toBe(0);
    const commands = await page.evaluate(() => {
      const target = window as typeof window & { dataLayer: IArguments[] };
      return target.dataLayer.map((args) => Array.from(args));
    });
    expect(commands).toContainEqual(["config", "G-X53SL63MK2", { send_page_view: false }]);
    expect(commands).toContainEqual([
      "event",
      "page_view",
      expect.objectContaining({ page_location: origin + "/", page_title: await page.title() }),
    ]);
    // Navigating before idle must neither duplicate initialization nor replace
    // the queued landing-page URL with the destination URL.
    await page.locator(".site-header__actions .lang-toggle").click();
    await page.waitForURL(origin + "/en/");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const target = window as typeof window & { dataLayer: IArguments[] };
          return target.dataLayer
            .filter((args) => args[1] === "page_view")
            .map((args) => args[2].page_location);
        }),
      )
      .toEqual([origin + "/", origin + "/en/"]);
    await page.evaluate(() => {
      (window as typeof window & { flushTestIdle: () => void }).flushTestIdle();
    });
    await expect.poll(() => requests).toBe(1);
    expect(await page.locator('script[src*="googletagmanager.com/gtag/js"]').count()).toBe(1);
    expect(
      await page.evaluate(() => {
        const target = window as typeof window & { dataLayer: IArguments[] };
        return target.dataLayer.filter((args) => args[0] === "config").length;
      }),
    ).toBe(1);
  } finally {
    await context.close();
  }
});

it.each(["navigator", "window"])("does not download GA when %s DNT is enabled", async (source) => {
  const context = await browser.newContext();
  try {
    let requests = 0;
    await context.route("https://www.googletagmanager.com/gtag/js?*", (route) => {
      requests++;
      return route.fulfill({ body: "", contentType: "text/javascript" });
    });
    await context.addInitScript((target) => {
      Object.defineProperty(target === "navigator" ? navigator : window, "doNotTrack", {
        value: "1",
        configurable: true,
      });
    }, source);
    const page = await context.newPage();
    await page.goto(origin + "/");
    expect(await page.evaluate(() => Reflect.get(window, "ga-disable-G-X53SL63MK2"))).toBe(true);
    expect(await page.locator('script[src*="googletagmanager.com/gtag/js"]').count()).toBe(0);
    expect(requests).toBe(0);
  } finally {
    await context.close();
  }
});

it("loads GA in browsers without requestIdleCallback", async () => {
  const context = await browser.newContext();
  try {
    let requests = 0;
    await context.route("https://www.googletagmanager.com/gtag/js?*", (route) => {
      requests++;
      return route.fulfill({ body: "", contentType: "text/javascript" });
    });
    await context.addInitScript(() => {
      Object.defineProperty(window, "requestIdleCallback", { value: undefined });
    });
    const page = await context.newPage();
    await page.goto(origin + "/");
    await expect.poll(() => requests).toBe(1);
  } finally {
    await context.close();
  }
});
