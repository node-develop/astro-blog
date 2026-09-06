import { existsSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { cleanupScratchPosts, createScratchPost, login, postPath } from "./helpers/admin";

test.afterEach(cleanupScratchPosts);

test("admin creates a new post from scratch", async ({ page }) => {
  await login(page);
  const slug = await createScratchPost(page, "new", "E2E Created Post");

  expect(existsSync(postPath(slug))).toBe(true);
  // The editor reopens the saved post; on an existing post the title is the first text input.
  await expect(page.locator('input[type="text"]').first()).toHaveValue("E2E Created Post");
});
