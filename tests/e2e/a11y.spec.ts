import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/blog", "/blog/02-context-and-cache"] as const;

test.describe("accessibility baseline", () => {
  for (const path of PAGES) {
    test(`no serious/critical a11y violations on ${path}`, async ({ page }) => {
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
