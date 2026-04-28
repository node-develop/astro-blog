import { expect, test } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:4321";

test.describe("lang-pref cookie redirect", () => {
  test("/ redirects to /en/ when cookie is set to en", async ({ page, context }) => {
    await context.addCookies([{ name: "lang-pref", value: "en", url: BASE_URL }]);

    await page.goto("/");
    await expect(page).toHaveURL(/\/en\/?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("/ does NOT redirect when cookie is ru", async ({ page, context }) => {
    await context.addCookies([{ name: "lang-pref", value: "ru", url: BASE_URL }]);

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });

  test("/blog/X is not redirected even with en cookie", async ({ page, context }) => {
    await context.addCookies([{ name: "lang-pref", value: "en", url: BASE_URL }]);

    await page.goto("/blog/01-introduction");
    await expect(page).toHaveURL(/\/blog\/01-introduction\/?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });

  test("direct visit to /en/blog/X works without cookie", async ({ page }) => {
    await page.goto("/en/blog/01-introduction");
    await expect(page).toHaveURL(/\/en\/blog\/01-introduction\/?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
