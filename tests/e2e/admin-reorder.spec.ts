import { expect, test, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login/");
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
  const endY = dropBox.y + dropBox.height / 2; // center of drop target row

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  // Brief pause so dnd-kit's pointer sensor registers the press before movement.
  await page.waitForTimeout(50);
  // Slow move to trigger dnd-kit pointer sensor (requires 5px activation distance).
  await page.mouse.move(startX, startY + 3, { steps: 5 });
  await page.mouse.move(startX, startY + 8, { steps: 5 });
  await page.mouse.move(endX, endY, { steps: 30 });
  await page.mouse.up();
}

test("admin reorder persists across refresh and reflects on public blog", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/admin/posts/");

  const rows = page.locator(".post-list__item");
  await expect(rows.first()).toBeVisible();

  // The admin list may start with pinned/hidden posts (e.g. hello-world, local-coding-agent).
  // We need two consecutive rows that are BOTH visible in the public blog (not hidden,
  // not pinned — so their relative order determines their rank on /blog).
  // Scan rows for the first non-pinned pair by checking the "pinned" toggle button state.
  const rowCount = await rows.count();
  let firstIdx = -1;
  for (let i = 0; i + 1 < rowCount; i++) {
    const row = rows.nth(i);
    // A pinned row has the accent-coloured toggle; aria-pressed="true" indicates pinned.
    const isPinned = (await row.locator(".post-list__toggle--accent").count()) > 0;
    const nextRow = rows.nth(i + 1);
    const nextIsPinned = (await nextRow.locator(".post-list__toggle--accent").count()) > 0;
    if (!isPinned && !nextIsPinned) {
      firstIdx = i;
      break;
    }
  }
  if (firstIdx < 0) throw new Error("Could not find two consecutive non-pinned rows");

  const firstTitle = await rows.nth(firstIdx).locator(".post-list__title").innerText();
  const secondTitle = await rows
    .nth(firstIdx + 1)
    .locator(".post-list__title")
    .innerText();

  // Drag firstIdx down by one.
  await dragRowDown(page, firstIdx);

  // Wait for the save status element to appear then disappear.
  await expect(page.locator(".post-list__status")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".post-list__status")).toHaveCount(0, { timeout: 10_000 });

  // Verify optimistic UI update: titles should be swapped.
  await expect(rows.nth(firstIdx).locator(".post-list__title")).toHaveText(secondTitle);
  await expect(rows.nth(firstIdx + 1).locator(".post-list__title")).toHaveText(firstTitle);

  // Refresh and verify the new order persisted in the DB.
  await page.reload();
  await expect(rows.nth(firstIdx).locator(".post-list__title")).toHaveText(secondTitle);
  await expect(rows.nth(firstIdx + 1).locator(".post-list__title")).toHaveText(firstTitle);

  // Public list reflects it: secondTitle is now before firstTitle.
  await page.goto("/blog/");
  const publicTitles = page.locator(".post-card__title");
  // Find both titles on the page and verify secondTitle comes first.
  const allTitles = await publicTitles.allInnerTexts();
  const secondPos = allTitles.indexOf(secondTitle);
  const firstPos = allTitles.indexOf(firstTitle);
  expect(secondPos).toBeGreaterThanOrEqual(0);
  expect(firstPos).toBeGreaterThanOrEqual(0);
  expect(secondPos).toBeLessThan(firstPos);

  // Cleanup: restore original order by dragging back.
  await page.goto("/admin/posts/");
  await dragRowDown(page, firstIdx);
  await expect(page.locator(".post-list__status")).toBeVisible({ timeout: 8_000 });
  await expect(page.locator(".post-list__status")).toHaveCount(0, { timeout: 10_000 });
});
