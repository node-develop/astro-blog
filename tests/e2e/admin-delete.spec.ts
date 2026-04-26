import { expect, test, type Page } from "@playwright/test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("e2e-admin@test.dev");
  await page.locator('input[name="password"]').fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

test("admin creates and then deletes a post", async ({ page }) => {
  await login(page);

  // Create.
  await page.goto("/admin/posts/new");
  await page.locator(".editor-shell").waitFor({ state: "visible" });
  const slug = `e2edelete${Date.now()}`;
  const slugInput = page.locator('input[type="text"]').first();
  await slugInput.fill(slug);
  await expect(slugInput).toHaveValue(slug);

  await page.locator('input[type="text"]').nth(1).fill("Delete me");

  await page.locator("textarea").first().fill("This post is about to be deleted.");

  const saveResponse = page.waitForResponse((res) => res.url().includes("_actions/posts"), {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /сохранить/i }).click();
  await saveResponse;
  await expect(page).toHaveURL(new RegExp(`/admin/posts/${slug}$`), { timeout: 10_000 });

  // Delete from list.
  await page.goto("/admin/posts");
  const row = page.locator(".post-list__item", { hasText: "Delete me" });
  page.on("dialog", (d) => d.accept());
  const deleteResponse = page.waitForResponse((res) => res.url().includes("_actions/posts"), {
    timeout: 15_000,
  });
  await row.getByRole("button", { name: /удалить/i }).click();
  await deleteResponse;

  await expect(row).toHaveCount(0, { timeout: 5_000 });
  const files = await readdir(join(process.cwd(), "src/content/posts"));
  expect(files.some((f) => f.startsWith(slug))).toBe(false);
});
