import { expect, test } from "@playwright/test";

test.describe("language toggle", () => {
  test("toggle on RU article navigates to EN article", async ({ page }) => {
    await page.goto("/blog/local-coding-agent/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");

    // LangToggle renders <a data-set-pref data-lang="en"> when the counterpart exists
    const toggle = page.locator('a[data-set-pref][data-lang="en"]');
    await expect(toggle).toBeVisible();
    await toggle.click();

    await expect(page).toHaveURL(/\/en\/blog\/local-coding-agent\/?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("toggle on EN article navigates back to RU", async ({ page }) => {
    await page.goto("/en/blog/local-coding-agent/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    const toggle = page.locator('a[data-set-pref][data-lang="ru"]');
    await expect(toggle).toBeVisible();
    await toggle.click();

    await expect(page).toHaveURL(/\/blog\/local-coding-agent\/?$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
  });

  test("toggle sets lang-pref cookie when clicked", async ({ page, context }) => {
    await page.goto("/blog/local-coding-agent/");

    const toggle = page.locator('a[data-set-pref][data-lang="en"]');
    await toggle.click();
    await expect(page).toHaveURL(/\/en\/blog\/local-coding-agent\/?$/);

    const cookies = await context.cookies();
    const pref = cookies.find((c) => c.name === "lang-pref");
    expect(pref?.value).toBe("en");
  });

  test("toggle on home page (/) shows link to /en/", async ({ page }) => {
    await page.goto("/");
    const toggle = page.locator('a[data-set-pref][data-lang="en"]');
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("href", /\/en\/?/);
  });

  test("article without EN counterpart renders disabled toggle button", async ({
    page,
    context,
  }) => {
    // Clear any lang-pref cookie set by earlier tests so this RU-only page
    // is served with lang="ru" as expected.
    await context.clearCookies();

    // e2e-ru-only.md is a test fixture with no EN counterpart, so the toggle
    // degrades to a <button disabled> instead of an <a>.
    await page.goto("/blog/e2e-ru-only/");
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");

    const disabled = page.locator("button.lang-toggle[disabled]");
    await expect(disabled).toBeVisible();

    // No navigable link with data-set-pref should be present
    const link = page.locator("a[data-set-pref]");
    await expect(link).toHaveCount(0);
  });
});
