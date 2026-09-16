import { expect, test } from "@playwright/test";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// The disclosure and anchor navigation must work without client-side JavaScript.
test.use({ javaScriptEnabled: false });

test("mobile and desktop TOCs follow Markdown headings and their generated IDs", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Reuse a known route: Astro caches getStaticPaths in dev, so adding a new
  // file mid-test need not make a new route immediately available.
  const slug = "robots-txt-ai-crawlers-2026";
  const fixture = join(process.cwd(), "src/content/posts", `${slug}.md`);
  const original = await readFile(fixture, "utf8");

  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/blog/${slug}/`, { waitUntil: "domcontentloaded" });
    const headingCount = await page.locator(".post__body h2").count();
    expect(headingCount).toBeGreaterThan(0);

    const mobile = page.locator("details.mobile-toc");
    const desktop = page.locator(".layout__toc .toc");
    const summary = mobile.locator("summary");
    await expect(mobile).toBeVisible();
    await expect(summary).toHaveText("Содержание");
    await expect(mobile).not.toHaveAttribute("open");
    await expect(desktop).toBeHidden();
    expect(
      await mobile.evaluate((element) =>
        Boolean(element.compareDocumentPosition(document.querySelector("article.post")!) & 4),
      ),
    ).toBe(true);

    await summary.focus();
    await page.keyboard.press("Enter");
    await expect(mobile).toHaveAttribute("open", "");
    const expectedLinks = await page
      .locator(".post__body :is(h2, h3)")
      .evaluateAll((headings) =>
        headings.map((heading) => ({ text: heading.textContent?.trim(), href: `#${heading.id}` })),
      );
    for (const toc of [mobile, desktop]) {
      expect(
        await toc.locator("a").evaluateAll((links) =>
          links.map((link) => ({
            text: link.textContent?.trim(),
            href: link.getAttribute("href"),
          })),
        ),
      ).toEqual(expectedLinks);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      390,
    );
    const firstHref = await mobile.locator("a").first().getAttribute("href");
    await mobile.locator("a").first().click();
    expect(decodeURIComponent(new URL(page.url()).hash)).toBe(firstHref);

    for (const width of [1023, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      if (width <= 1023) {
        await expect(mobile).toBeVisible();
        await expect(desktop).toBeHidden();
      } else {
        await expect(mobile).toBeHidden();
        await expect(desktop).toBeVisible();
      }
    }

    // Change the Markdown source, letting Astro generate the heading and slug.
    await appendFile(fixture, "\n## Новый раздел автоматически\n\nNew content.\n");
    await expect(async () => {
      await page.goto(`/blog/${slug}/`, { waitUntil: "domcontentloaded" });
      await expect(page.locator(".post__body h2")).toHaveCount(headingCount + 1);
    }).toPass({ timeout: 30_000 });
    const newHeading = page.locator(".post__body h2").last();
    const newHref = `#${await newHeading.getAttribute("id")}`;
    for (const toc of [mobile, desktop]) {
      await expect(toc.locator("a").last()).toHaveText((await newHeading.textContent())!.trim());
      await expect(toc.locator("a").last()).toHaveAttribute("href", newHref);
    }
  } finally {
    await writeFile(fixture, original);
  }
});
