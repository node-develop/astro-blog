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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // We keep `pnpm dev` because Astro 5 enforces CSRF-style origin checks on
  // form POSTs in preview mode that admin tests rely on bypassing. global-setup
  // ensures dist/client/pagefind is built and symlinked into public/pagefind so
  // the ⌘K palette can fetch /pagefind/pagefind.js via the dev static handler.
  webServer: process.env.CI
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:4321",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
