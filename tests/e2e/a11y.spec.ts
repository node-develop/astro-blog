import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

interface PageDef {
  readonly path: string;
  readonly auth: "public" | "admin";
}

const PAGES: readonly PageDef[] = [
  { path: "/", auth: "public" },
  { path: "/blog", auth: "public" },
  { path: "/blog/02-context-and-cache", auth: "public" },
  { path: "/search", auth: "public" },
  { path: "/search?q=context", auth: "public" },
  { path: "/admin/posts", auth: "admin" },
  { path: "/admin/posts/new", auth: "admin" },
  { path: "/admin/media", auth: "admin" },
];

async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[name="email"]').fill("e2e-admin@test.dev");
  await page.locator('input[name="password"]').fill("e2e-admin-password");
  await page.getByRole("button", { name: /войти/i }).click();
  await expect(page).toHaveURL(/\/admin\/posts/);
}

test.describe("accessibility baseline", () => {
  for (const { path, auth } of PAGES) {
    test(`no serious/critical a11y violations on ${path}`, async ({ page }) => {
      if (auth === "admin") await loginAsAdmin(page);
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

test("no serious/critical a11y violations in open command palette", async ({
  page,
  browserName,
}) => {
  await page.goto("/");
  await page.waitForFunction(
    () => document.querySelector("astro-island[component-export='default']:not([ssr])") !== null,
    { timeout: 10_000 },
  );
  const mod = browserName === "webkit" ? "Meta" : "Control";
  await page.keyboard.press(`${mod}+k`);
  await expect(page.locator("[cmdk-dialog]")).toBeVisible();

  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = result.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  if (blocking.length > 0) console.log(JSON.stringify(blocking, null, 2));
  expect(blocking).toEqual([]);
});
