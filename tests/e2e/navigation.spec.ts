import { expect, test } from "@playwright/test";

test.describe("site navigation", () => {
  test("course sidebar links to a lesson and marks it active", async ({ page }, testInfo) => {
    // CourseSidebar is the only `slot="sidebar"` provider since the course
    // launch (May 2026) retired the post list on "/". The desktop aside is
    // hidden on phones, where the drawer test below covers navigation.
    test.skip(testInfo.project.name === "iphone-se", "desktop-only sidebar");
    await page.goto("/courses/claude-code-guide/");

    const firstLink = page.locator(".layout__sidebar .sidebar__link").first();
    const href = await firstLink.getAttribute("href");
    expect(href).toBeTruthy();

    await firstLink.click();
    await expect(page).toHaveURL(href!);

    const activeLink = page.locator('.sidebar__link[aria-current="page"]').first();
    await expect(activeLink).toHaveAttribute("href", href!);
  });

  test("TOC entry jumps to matching heading and highlights it", async ({ page }, testInfo) => {
    // BaseLayout hides .layout__toc under 1024px; the rail is desktop-only.
    test.skip(testInfo.project.name === "iphone-se", "desktop-only TOC rail");
    await page.goto("/blog/claude-md-12-rules/");
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

    // Backdrop and the ✕ button both close the drawer; use the explicit button.
    await page.locator(".drawer__close[data-drawer-close]").click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});
