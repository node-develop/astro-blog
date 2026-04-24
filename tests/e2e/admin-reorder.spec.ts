import { expect, test, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("e2e-admin@test.dev");
  await page.locator('input[name="password"]').fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

/**
 * Drag row at `fromIndex` down one slot using mouse drag on the handle.
 * dnd-kit keyboard sensors don't fire reliably in headless Chromium,
 * so we use pointer events instead.
 */
async function dragRowDown(page: Page, fromIndex: number): Promise<void> {
  const rows = page.locator(".post-list__item");
  const dragHandle = rows.nth(fromIndex).locator(".post-list__handle");
  const dropTarget = rows.nth(fromIndex + 1).locator(".post-list__handle");

  const dragBox = await dragHandle.boundingBox();
  const dropBox = await dropTarget.boundingBox();
  if (!dragBox || !dropBox) throw new Error("Could not get bounding boxes for drag");

  const startX = dragBox.x + dragBox.width / 2;
  const startY = dragBox.y + dragBox.height / 2;
  const endX = dropBox.x + dropBox.width / 2;
  const endY = dropBox.y + dropBox.height + 4; // slightly below drop target

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Slow move to trigger dnd-kit pointer sensor (requires 5px activation distance)
  await page.mouse.move(startX, startY + 5, { steps: 3 });
  await page.mouse.move(endX, endY, { steps: 20 });
  await page.mouse.up();
}

test("admin reorder persists across refresh and reflects on public blog", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/posts");

  const rows = page.locator(".post-list__item");
  await expect(rows.first()).toBeVisible();
  const firstTitleBefore = await rows.nth(0).locator(".post-list__title").innerText();
  const secondTitleBefore = await rows.nth(1).locator(".post-list__title").innerText();

  // Drag first row down by one.
  await dragRowDown(page, 0);

  // Wait for the save status element to appear then disappear.
  await expect(page.locator(".post-list__status")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".post-list__status")).toHaveCount(0, { timeout: 10_000 });

  // Verify optimistic UI update: titles should be swapped already.
  await expect(rows.nth(0).locator(".post-list__title")).toHaveText(secondTitleBefore);
  await expect(rows.nth(1).locator(".post-list__title")).toHaveText(firstTitleBefore);

  // Refresh and verify the new order persisted in the DB.
  await page.reload();
  await expect(rows.nth(0).locator(".post-list__title")).toHaveText(secondTitleBefore);
  await expect(rows.nth(1).locator(".post-list__title")).toHaveText(firstTitleBefore);

  // Public list reflects it.
  await page.goto("/blog");
  const publicTitles = page.locator(".list__post-title");
  await expect(publicTitles.nth(0)).toHaveText(secondTitleBefore);

  // Cleanup: restore original order.
  await page.goto("/admin/posts");
  await dragRowDown(page, 0);
  await expect(page.locator(".post-list__status")).toBeVisible({ timeout: 5_000 });
  await expect(page.locator(".post-list__status")).toHaveCount(0, { timeout: 10_000 });
});
