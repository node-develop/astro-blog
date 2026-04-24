import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("e2e-admin@test.dev");
  await page.locator('input[name="password"]').fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

test("admin creates a new post from scratch", async ({ page }) => {
  await login(page);
  await page.goto("/admin/posts/new");
  // Wait for the React island to hydrate fully.
  await page.locator(".editor-shell").waitFor({ state: "visible" });

  const slug = `e2enew${Date.now()}`;
  // Slug is the FIRST input on the new-post page (rendered because slug prop is null).
  const slugInput = page.locator('input[type="text"]').first();
  // Use pressSequentially to fire keyboard events React can observe.
  await slugInput.click();
  await slugInput.pressSequentially(slug, { delay: 20 });
  // Confirm React state reflects the value.
  await expect(slugInput).toHaveValue(slug);

  // Title comes next — the second text input.
  const titleInput = page.locator('input[type="text"]').nth(1);
  await titleInput.click();
  await titleInput.pressSequentially("E2E Created Post", { delay: 10 });

  // Description is the first textarea.
  const descInput = page.locator("textarea").first();
  await descInput.click();
  await descInput.pressSequentially("Description for e2e created post testing purposes.", {
    delay: 10,
  });

  const saveResponsePromise = page.waitForResponse((res) => res.url().includes("_actions/posts"), {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /сохранить/i }).click();
  await saveResponsePromise;

  // After save, EditorShell redirects to /admin/posts/<slug>.
  await expect(page).toHaveURL(new RegExp(`/admin/posts/${slug}$`), { timeout: 10_000 });
});
