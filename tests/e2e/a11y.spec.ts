import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { login } from "./helpers/admin";

interface PageDef {
  readonly path: string;
  readonly auth: "public" | "admin";
}

const PAGES: readonly PageDef[] = [
  { path: "/", auth: "public" },
  { path: "/blog/", auth: "public" },
  { path: "/blog/claude-md-12-rules/", auth: "public" },
  { path: "/search/", auth: "public" },
  { path: "/search/?q=context", auth: "public" },
  { path: "/admin/posts/", auth: "admin" },
  { path: "/admin/posts/new/", auth: "admin" },
  { path: "/admin/media/", auth: "admin" },
];

test.describe("accessibility baseline", () => {
  for (const { path, auth } of PAGES) {
    test(`no serious/critical a11y violations on ${path}`, async ({ page }) => {
      if (auth === "admin") await login(page);
      await page.goto(path);

      const result = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();
      const blocking = result.violations.filter(
        (v) => v.impact === "serious" || v.impact === "critical",
      );
      if (blocking.length > 0) {
        console.log(JSON.stringify(blocking, null, 2));
      }
      expect(blocking).toEqual([]);
    });
  }
});

test("no serious/critical a11y violations in the open search modal", async ({ page }) => {
  await page.goto("/");
  // Search.astro picks ⌘ vs Ctrl from navigator.platform, which device
  // emulation does not change, so follow the host OS of the test runner.
  await page.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await expect(page.locator("[data-search]")).toHaveAttribute("aria-hidden", "false");
  // Audit the settled dialog: mid-transition axe blends the panel with the
  // dimmed backdrop and reports contrast ratios the final UI does not have.
  await expect(page.locator(".search__panel")).toHaveCSS("opacity", "1");

  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  if (blocking.length > 0) console.log(JSON.stringify(blocking, null, 2));
  expect(blocking).toEqual([]);
});
