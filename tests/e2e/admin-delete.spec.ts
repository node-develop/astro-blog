import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import {
  cleanupScratchPosts,
  clickAction,
  createScratchPost,
  gotoWithRetry,
  login,
  postPath,
  waitForIsland,
} from "./helpers/admin";

test.afterEach(cleanupScratchPosts);

test("admin creates and then deletes a post", async ({ page }) => {
  await login(page);
  const slug = await createScratchPost(page, "delete", "Delete me");

  await gotoWithRetry(page, "/admin/posts/");
  await waitForIsland(page, "PostList");
  const row = page.locator(".post-list__item", { hasText: "Delete me" });
  await expect(row).toHaveCount(1);
  page.on("dialog", (dialog) => void dialog.accept());
  await clickAction(page, row.getByRole("button", { name: /удалить/i }));

  await expect.poll(() => existsSync(postPath(slug)), { timeout: 15_000 }).toBe(false);
  await gotoWithRetry(page, "/admin/posts/");
  await expect(page.locator(".post-list__item", { hasText: "Delete me" })).toHaveCount(0);
});
