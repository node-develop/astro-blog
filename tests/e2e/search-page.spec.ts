import { expect, test } from "@playwright/test";

test("/search/?q= renders results SSR", async ({ page }) => {
  await page.goto("/search/?q=context");
  await expect(page.locator("h1", { hasText: /поиск/i })).toBeVisible();

  // Either at least one result is shown, or the empty state is shown — both are
  // valid SSR paths depending on whether the query matched.
  const results = await page.locator(".search-page__results li").count();
  const empty = await page.locator(".search-page__empty").isVisible();
  expect(results > 0 || empty).toBe(true);
});

test("/search/ empty state shows hint", async ({ page }) => {
  await page.goto("/search/");
  await expect(page.locator(".search-page__hint")).toBeVisible();
});

test("/en/search/ renders the English search contract", async ({ page }) => {
  await page.goto("/en/search/");

  await expect(page.getByRole("heading", { level: 1, name: "Search" })).toBeVisible();
  await expect(page.getByRole("search")).toHaveAttribute("action", "/en/search/");
  await expect(page.getByLabel("Search query")).toHaveAttribute("placeholder", "Search…");
  await expect(page.getByRole("search").getByRole("button", { name: "Search" })).toBeVisible();
  await expect(page.locator(".search-page__hint")).toContainText(
    "Enter a query or press ⌘K anywhere on the site.",
  );
});
