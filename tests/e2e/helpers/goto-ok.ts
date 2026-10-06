import { expect, type Page } from "@playwright/test";

/**
 * Opens a page that must exist. A missing post renders the 404 page through the same layout, so
 * `lang` and the language toggle can look right on it: assert the status, not only the markup.
 */
export const gotoOk = async (page: Page, path: string): Promise<void> => {
  const response = await page.goto(path);
  expect(response?.status(), path).toBe(200);
};
