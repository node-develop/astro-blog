import { expect, test, type Page } from "@playwright/test";

/**
 * Cal.com booking embed on /contact/ and the home-page CTA that points at it.
 *
 * Fully offline: embed.js is replaced by a stub that records the instructions
 * the page queued, mounts a placeholder iframe for `inline`, and answers the
 * `linkReady` subscription the way the real booker does.
 */
const CAL_ORIGIN = "https://app.cal.com";

const EMBED_STUB = `
(function () {
  var calls = (window.__calCalls = []);
  var Cal = window.Cal;
  Cal.q.forEach(function (a) { calls.push(["global"].concat(Array.from(a))); });
  Object.keys(Cal.ns).forEach(function (name) {
    var handle = function (args) {
      calls.push([name].concat(args));
      if (args[0] === "inline") {
        var frame = document.createElement("iframe");
        frame.title = "booker stub";
        args[1].elementOrSelector.appendChild(frame);
      }
      if (args[0] === "on" && args[1].action === "linkReady") setTimeout(args[1].callback, 0);
    };
    Cal.ns[name].q.forEach(function (a) { handle(Array.from(a)); });
    Cal.ns[name] = function () { handle(Array.from(arguments)); };
  });
})();
`;

type CalCall = [string, ...unknown[]];

const calRequests = (page: Page): string[] => {
  const seen: string[] = [];
  page.on("request", (request) => {
    if (request.url().startsWith(CAL_ORIGIN)) seen.push(request.url());
  });
  return seen;
};

const stubEmbed = (page: Page) =>
  page.route(`${CAL_ORIGIN}/**`, (route) =>
    route.fulfill({ contentType: "text/javascript", body: EMBED_STUB }),
  );

const recordedCalls = (page: Page): Promise<CalCall[]> =>
  page.evaluate(() => (window as unknown as { __calCalls?: CalCall[] }).__calCalls ?? []);

test.describe("booking widget", () => {
  test("talks to Cal.com only after the reader asks for the calendar", async ({ page }) => {
    const requests = calRequests(page);
    await stubEmbed(page);
    await page.goto("/contact/");

    const section = page.locator("#book");
    await expect(section.getByRole("heading", { name: "Записаться на созвон" })).toBeVisible();
    await expect(section.locator("[data-booking-fallback]")).toHaveAttribute(
      "href",
      "https://cal.com/kashuta/intro-ru",
    );
    expect(requests).toEqual([]);

    await section.getByRole("button", { name: "Выбрать время" }).click();

    await expect(section).toHaveAttribute("data-state", "ready");
    await expect(section.locator("iframe")).toBeAttached();
    await expect(section.getByRole("button", { name: "Выбрать время" })).toBeHidden();
    expect(requests).toEqual([`${CAL_ORIGIN}/embed/embed.js`]);

    const calls = await recordedCalls(page);
    const init = calls.find((c) => c[1] === "init");
    const inline = calls.find((c) => c[1] === "inline");
    expect(init?.[3]).toEqual({ origin: CAL_ORIGIN });
    expect(inline?.[2]).toMatchObject({
      calLink: "kashuta/intro-ru",
      config: { theme: "light", layout: "month_view" },
    });
  });

  test("books the English event from /en/contact/", async ({ page }) => {
    await stubEmbed(page);
    await page.goto("/en/contact/");

    const section = page.locator("#book");
    await section.getByRole("button", { name: "Choose a time" }).click();
    await expect(section).toHaveAttribute("data-state", "ready");

    const inline = (await recordedCalls(page)).find((c) => c[1] === "inline");
    expect(inline?.[2]).toMatchObject({ calLink: "kashuta/intro-en" });
  });

  test("re-themes the live booker when the site theme is toggled", async ({ page }) => {
    await stubEmbed(page);
    await page.goto("/contact/");
    await page.locator("#book [data-booking-open]").click();
    await expect(page.locator("#book")).toHaveAttribute("data-state", "ready");

    await page.locator("[data-theme-toggle]:visible").first().click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

    await expect
      .poll(async () =>
        (await recordedCalls(page)).some(
          (c) => c[1] === "ui" && (c[2] as { theme?: string }).theme === "dark",
        ),
      )
      .toBe(true);
  });

  test("keeps the fallback link and says so when embed.js never arrives", async ({ page }) => {
    await page.clock.install();
    await page.route(`${CAL_ORIGIN}/**`, (route) => route.abort());
    await page.goto("/contact/");

    const section = page.locator("#book");
    await section.locator("[data-booking-open]").click();
    await page.clock.runFor(16_000);

    await expect(section).toHaveAttribute("data-state", "failed");
    await expect(section.getByRole("status")).toContainText("Календарь не загрузился");
    await expect(section.locator("[data-booking-fallback]")).toBeVisible();
    await expect(section.locator("[data-booking-open]")).toBeEnabled();
  });

  test("home masthead links to the booking section in each language", async ({ page }) => {
    await page.goto("/");
    const ru = page.locator(".masthead__cta--secondary");
    await expect(ru).toBeVisible();
    await expect(ru).toHaveText("Назначить встречу");
    await expect(ru).toHaveAttribute("href", "/contact/#book");

    await page.goto("/en/");
    const en = page.locator(".masthead__cta--secondary");
    await expect(en).toBeVisible();
    await expect(en).toHaveText("Let's meet");
    await expect(en).toHaveAttribute("href", "/en/contact/#book");
  });
});
