import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("e2e-admin@test.dev");
  await page.locator('input[name="password"]').fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

test("admin can filter posts via search input", async ({ page }) => {
  await login(page);
  await page.goto("/admin/posts");

  const initial = await page.locator(".post-list__title").count();
  expect(initial).toBeGreaterThan(2);

  await page.locator('input[type="search"]').fill("context");
  // Debounced 300ms — wait a bit longer to be safe.
  await page.waitForTimeout(500);

  const filtered = await page.locator(".post-list__title").count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(initial);
});
