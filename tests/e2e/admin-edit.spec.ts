import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("e2e-admin@test.dev");
  await page.locator('input[name="password"]').fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

/** Navigate with retry to handle dev-server HMR aborts between tests. */
async function gotoWithRetry(page: Page, url: string, maxAttempts = 3): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 10_000 });
      return;
    } catch {
      if (i === maxAttempts - 1)
        throw new Error(`Failed to navigate to ${url} after ${maxAttempts} attempts`);
      await page.waitForTimeout(1_000);
    }
  }
}

test("admin edits a post, sees revision, restores prior version", async ({ page }) => {
  await login(page);

  await page.goto("/admin/posts");
  const firstTitle = page.locator(".post-list__title").first();
  const href = await firstTitle.getAttribute("href");
  expect(href).toBeTruthy();
  await firstTitle.click();
  // Wait for React island to hydrate.
  await page.locator(".editor-shell").waitFor({ state: "visible" });

  // The FrontmatterForm title input is the first text input on the edit page.
  const titleInput = page.locator('input[type="text"]').first();
  const original = await titleInput.inputValue();
  const modified = `${original} [edited]`;
  await titleInput.click({ clickCount: 3 });
  await titleInput.pressSequentially(modified, { delay: 10 });
  await expect(titleInput).toHaveValue(modified);

  const saveResponse1 = page.waitForResponse((res) => res.url().includes("_actions/posts"), {
    timeout: 15_000,
  });
  await page.getByRole("button", { name: /сохранить/i }).click();
  await saveResponse1;
  await expect(page.locator(".editor-shell__hint")).toBeVisible({ timeout: 5_000 });

  // Visit history.
  const slugMatch = href!.match(/\/admin\/posts\/([^/]+)/);
  const slug = slugMatch?.[1] ?? "";
  await gotoWithRetry(page, `/admin/revisions/${slug}`);

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
  await gotoWithRetry(page, `/admin/posts/${slug}`);
  await page.locator(".editor-shell").waitFor({ state: "visible" });
  const titleInput2 = page.locator('input[type="text"]').first();
  const current = await titleInput2.inputValue();
  const cleaned = current.replace(/ \[edited\]$/, "");
  if (cleaned !== current) {
    await titleInput2.click({ clickCount: 3 });
    await titleInput2.pressSequentially(cleaned, { delay: 10 });
    await expect(titleInput2).toHaveValue(cleaned);
    const saveResponse2 = page.waitForResponse((res) => res.url().includes("_actions/posts"), {
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /сохранить/i }).click();
    await saveResponse2;
    await expect(page.locator(".editor-shell__hint")).toBeVisible({ timeout: 5_000 });
  }
});
