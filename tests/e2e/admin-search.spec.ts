import { expect, test } from "@playwright/test";
import { gotoWithRetry, login, waitForIsland } from "./helpers/admin";

test("admin can filter posts via search input", async ({ page }) => {
  await login(page);
  await gotoWithRetry(page, "/admin/posts/");
  await waitForIsland(page, "PostList");

  const initial = await page.locator(".post-list__title").count();
  expect(initial).toBeGreaterThan(2);

  // "haiku" is mentioned in roughly half of the seeded posts — broad enough
  // to return >0 hits, narrow enough to verify filtering happened.
  const searchInput = page.locator('input[type="search"]');
  await searchInput.click();
  await searchInput.pressSequentially("haiku", { delay: 30 });

  // Wait for the action response so we don't race the 300ms debounce.
  await page.waitForResponse(
    (res) => res.url().includes("_actions/posts.search") && res.status() === 200,
    { timeout: 5_000 },
  );
  // Allow the React state update + re-render to flush.
  await page.waitForTimeout(200);

  const filtered = await page.locator(".post-list__title").count();
  expect(filtered).toBeGreaterThan(0);
  expect(filtered).toBeLessThan(initial);
});
