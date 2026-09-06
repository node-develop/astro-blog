import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import {
  cleanupScratchPosts,
  clickAction,
  createScratchPost,
  expectPostFile,
  gotoWithRetry,
  login,
  saveButton,
} from "./helpers/admin";

test.afterEach(cleanupScratchPosts);

test("admin uploads an image and attaches it as post cover", async ({ page }) => {
  await login(page);
  await gotoWithRetry(page, "/admin/media/");

  const fixture = resolve(process.cwd(), "tests/e2e/fixtures/pixel.png");
  // The file input inside MediaUploader is hidden — set files directly on it.
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator(".media-grid img").first()).toBeVisible({ timeout: 10_000 });

  // Attach the cover to a scratch post so tracked content stays untouched.
  const slug = await createScratchPost(page, "media", "E2E media post");
  await page.locator(".editor-shell__save").waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");

  const coverBtn = page.getByRole("button", { name: /выбрать обложку/i });
  await expect(coverBtn).toBeEnabled({ timeout: 10_000 });
  await coverBtn.click();
  await expect(page.locator(".media-picker__dialog")).toBeVisible({ timeout: 10_000 });
  // The dialog fetches the media list asynchronously — wait for at least one item.
  await expect(page.locator(".media-picker__dialog ul li button").first()).toBeVisible({
    timeout: 10_000,
  });
  await page.locator(".media-picker__dialog ul li button").first().click();

  await clickAction(page, saveButton(page));
  // MediaPicker stores an upload-relative path (`2026/09/pixel-<hash>.png`).
  await expectPostFile(
    slug,
    (raw) => /^cover: .*pixel-[0-9a-f]+\.png$/m.test(raw),
    "uploaded image written as cover",
  );
});
