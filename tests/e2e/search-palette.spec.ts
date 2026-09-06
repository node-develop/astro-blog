import { expect, test } from "@playwright/test";

// Search.astro picks ⌘ vs Ctrl from navigator.platform; Playwright's device
// emulation keeps the host platform, so derive the modifier from the runner OS.
const searchShortcut = process.platform === "darwin" ? "Meta+k" : "Control+k";

test("⌘K opens the search modal and navigates to a result", async ({ page }) => {
  await page.goto("/");
  const modal = page.locator("[data-search]");
  await expect(modal).toHaveAttribute("aria-hidden", "true");

  await page.keyboard.press(searchShortcut);
  await expect(modal).toHaveAttribute("aria-hidden", "false");

  // Pagefind index comes from dist/client/pagefind (symlinked by global-setup).
  await page.locator("[data-search-input]").fill("claude");
  const firstResult = page.locator(".search__result").first();
  await expect(firstResult).toBeVisible({ timeout: 10_000 });
  const href = await firstResult.getAttribute("href");
  expect(href).toMatch(/^\/.+\/$/);

  await firstResult.click();
  await expect(page).toHaveURL(href!);
  await expect(modal).toHaveAttribute("aria-hidden", "true");
});
