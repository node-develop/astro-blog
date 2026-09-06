import { expect, test } from "@playwright/test";
import {
  cleanupScratchPosts,
  clickAction,
  createScratchPost,
  expectPostFile,
  gotoWithRetry,
  login,
  openPostEditor,
  saveButton,
} from "./helpers/admin";

test.afterEach(cleanupScratchPosts);

test("admin edits a post, sees revision, restores prior version", async ({ page }) => {
  await login(page);
  const original = "E2E edit post";
  const slug = await createScratchPost(page, "edit", original);

  // On an existing post the FrontmatterForm title is the first text input.
  const titleInput = page.locator('input[type="text"]').first();
  const modified = `${original} [edited]`;
  await titleInput.fill(modified);
  await expect(titleInput).toHaveValue(modified);
  await clickAction(page, saveButton(page));
  await expectPostFile(slug, (raw) => raw.includes(modified), "edited title written to disk");

  // History lists the revisions; the oldest one is the version before the edit.
  await gotoWithRetry(page, `/admin/revisions/${slug}/`);
  const items = page.locator(".revision-list__item");
  await expect(items.first()).toBeVisible();
  await items.last().click();
  page.on("dialog", (dialog) => void dialog.accept());
  await clickAction(
    page,
    page.getByRole("button", { name: /восстановить/i }),
    "_actions/revisions",
  );
  await expectPostFile(
    slug,
    (raw) => raw.includes(original) && !raw.includes("[edited]"),
    "restored title written to disk",
  );

  await openPostEditor(page, slug);
  await expect(page.locator('input[type="text"]').first()).toHaveValue(original);
});
