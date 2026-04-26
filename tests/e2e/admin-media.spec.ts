import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("e2e-admin@test.dev");
  await page.locator('input[name="password"]').fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

test("admin uploads an image and attaches it as post cover", async ({ page }) => {
  await login(page);
  await page.goto("/admin/media");

  const fixture = resolve(process.cwd(), "tests/e2e/fixtures/pixel.png");

  // The file input inside MediaUploader is hidden — set files directly on it.
  await page.locator('input[type="file"]').setInputFiles(fixture);

  // Wait for the image to appear in the grid.
  await expect(page.locator(".media-grid img").first()).toBeVisible({ timeout: 10_000 });

  // Open the first post and attach the cover.
  await page.goto("/admin/posts");
  await page.locator(".post-list__title").first().click();

  // Wait for the React island to be visible and fully hydrated before interacting.
  await page.locator(".editor-shell__save").waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");

  const coverBtn = page.getByRole("button", { name: /выбрать обложку/i });
  await expect(coverBtn).toBeEnabled({ timeout: 10_000 });
  await coverBtn.click();
  // Wait for the dialog itself to appear first.
  await expect(page.locator(".media-picker__dialog")).toBeVisible({ timeout: 10_000 });
  // The dialog fetches the media list asynchronously — wait for at least one item.
  await expect(page.locator(".media-picker__dialog ul li button").first()).toBeVisible({
    timeout: 10_000,
  });
  await page.locator(".media-picker__dialog ul li button").first().click();

  const saveResponsePromise = page.waitForResponse((res) => res.url().includes("_actions/posts"), {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /сохранить/i }).click();
  await saveResponsePromise;
  await expect(page.locator(".editor-shell__hint")).toBeVisible({ timeout: 10_000 });

  // Cleanup: remove the cover so the post file stays clean for subsequent runs.
  await page.getByRole("button", { name: /убрать/i }).click();
  const cleanupResponse = page.waitForResponse((res) => res.url().includes("_actions/posts"), {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /сохранить/i }).click();
  await cleanupResponse;
  await expect(page.locator(".editor-shell__hint")).toBeVisible({ timeout: 10_000 });
});
