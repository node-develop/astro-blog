import { expect, test } from "@playwright/test";

test.describe("site navigation", () => {
  test("sidebar links to a post and marks it active", async ({ page }) => {
    await page.goto("/");

    // Scope to the desktop aside — the mobile drawer renders a duplicate that
    // lives inside a <dialog> (hidden by default) and would time out on click.
    const firstLink = page.locator(".layout__sidebar .sidebar__link").first();
    const href = await firstLink.getAttribute("href");
    expect(href).toBeTruthy();

    await firstLink.click();
    await expect(page).toHaveURL(href!);

    const activeLink = page.locator('.sidebar__link[aria-current="page"]').first();
    await expect(activeLink).toHaveAttribute("href", href!);
  });

  test("TOC entry jumps to matching heading and highlights it", async ({ page }) => {
    await page.goto("/blog/02-context-and-cache");
    const tocEntry = page.locator(".toc__link").first();
    const slug = await tocEntry.getAttribute("data-toc-slug");
    expect(slug).toBeTruthy();

    await tocEntry.click();
    // The browser percent-encodes non-ASCII fragment slugs in the URL, so we
    // compare against the encoded form to avoid a regex mismatch.
    const encodedSlug = encodeURIComponent(slug!);
    await expect(page).toHaveURL(new RegExp(`#${encodedSlug}$`));

    await page.waitForTimeout(400); // let scroll-spy settle
    await expect(tocEntry).toHaveAttribute("data-active", "true");
  });

  test("mobile drawer opens and closes", async ({ page }) => {
    await page.setViewportSize({ width: 430, height: 900 });
    await page.goto("/");

    const trigger = page.locator("[data-drawer-trigger]");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    await trigger.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");

    await page.locator("[data-drawer-close]").click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
