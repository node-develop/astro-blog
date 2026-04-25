import { expect, test } from "@playwright/test";

test("⌘K opens palette and navigates to a result", async ({ page, browserName }) => {
  await page.goto("/");
  // CommandPalette is client:idle — wait for hydration before pressing the
  // shortcut so the keydown listener is actually attached.
  await page.waitForFunction(
    () => document.querySelector("astro-island[component-export='default']:not([ssr])") !== null,
    { timeout: 10_000 },
  );
  // Use Meta on WebKit (Mac), Control elsewhere — matches CommandPalette's
  // navigator.platform check (metaKey on Mac, ctrlKey otherwise).
  const mod = browserName === "webkit" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+k`);

  await expect(page.locator("[cmdk-dialog]")).toBeVisible({ timeout: 5_000 });
  await page.locator("[cmdk-input]").fill("context");

  const firstItem = page.locator("[cmdk-item]").first();
  await expect(firstItem).toBeVisible({ timeout: 5_000 });
  await firstItem.click();

  // Navigated away from "/"
  await expect(page).not.toHaveURL(/^https?:\/\/[^/]+\/?$/);
});
