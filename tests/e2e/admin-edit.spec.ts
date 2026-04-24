import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("e2e-admin@test.dev");
  await page.locator('input[name="password"]').fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

test("admin edits a post, sees revision, restores prior version", async ({ page }) => {
  await login(page);

  await page.goto("/admin/posts");
  const firstTitle = page.locator(".post-list__title").first();
  const href = await firstTitle.getAttribute("href");
  expect(href).toBeTruthy();
  await firstTitle.click();

  // The FrontmatterForm title input is the first text input on the edit page.
  const titleInput = page.locator('input[type="text"]').first();
  const original = await titleInput.inputValue();
  const modified = `${original} [edited]`;
  await titleInput.fill(modified);
  await page.getByRole("button", { name: /сохранить/i }).click();
  await expect(page.locator(".editor-shell__hint")).toBeVisible({ timeout: 10_000 });

  // Visit history.
  const slugMatch = href!.match(/\/admin\/posts\/([^/]+)/);
  const slug = slugMatch?.[1] ?? "";
  await page.goto(`/admin/revisions/${slug}`);

  const items = page.locator(".revision-list__item");
  await expect(items.first()).toBeVisible();

  // Restore the second-most-recent revision if one exists.
  if ((await items.count()) >= 2) {
    await items.nth(1).click();
    page.on("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /восстановить/i }).click();
    await page.waitForLoadState("load");
  }

  // Cleanup: edit back to remove the [edited] suffix.
  await page.goto(`/admin/posts/${slug}`);
  const titleInput2 = page.locator('input[type="text"]').first();
  const current = await titleInput2.inputValue();
  const cleaned = current.replace(/ \[edited\]$/, "");
  if (cleaned !== current) {
    await titleInput2.fill(cleaned);
    await page.getByRole("button", { name: /сохранить/i }).click();
    await expect(page.locator(".editor-shell__hint")).toBeVisible({ timeout: 10_000 });
  }
});
