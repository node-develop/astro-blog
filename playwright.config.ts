import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  testDir: "./tests/e2e",
  // File-mutation tests (create/edit/delete posts) trigger Astro HMR restarts
  // which abort concurrent connections — run sequentially everywhere.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? "github" : "html",
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:4321",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // iphone-se uses Chromium with the iPhone SE viewport instead of WebKit,
    // because the WebKit binary isn't installed in CI/dev by default and
    // mobile-overflow tests only need a narrow viewport, not Safari rendering.
    {
      name: "iphone-se",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 667 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  // We keep `pnpm dev` because Astro enforces CSRF-style origin checks on
  // form POSTs in preview mode that admin tests rely on bypassing. global-setup
  // ensures dist/client/pagefind is built and symlinked into public/pagefind so
  // the ⌘K palette can fetch /pagefind/pagefind.js via the dev static handler.
  //
  // Astro 7 auto-detects AI-agent environments (am-i-vibing: CLAUDECODE,
  // CURSOR_TRACE_ID, ...) and then runs `astro dev` as a detached background
  // daemon: the launcher exits as soon as the server is up, Playwright reports
  // "Process from config.webServer exited early" and the orphaned server keeps
  // port 4321 busy. ASTRO_DEV_BACKGROUND is the marker Astro itself passes to
  // that daemon child ("you are the server: stay in the foreground, skip the
  // detection"), so setting it here keeps `pnpm dev` an ordinary child process
  // that Playwright owns and kills, no matter who (agent or human) runs it.
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:4321",
        reuseExistingServer: true,
        timeout: 120_000,
        env: { ASTRO_DEV_BACKGROUND: "1" },
      },
});
