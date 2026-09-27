// Renders scripts/og.html into public/og.png (1200x630) for link previews.
// Needs Playwright with Chromium available: node scripts/render-og.mjs
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));
// CHROMIUM_PATH lets the script use a preinstalled browser when Playwright versions differ.
const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(join(here, "og.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(here, "..", "public", "og.png"), type: "png" });
await browser.close();
console.log("public/og.png written");
