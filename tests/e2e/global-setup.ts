import { execSync } from "node:child_process";
import { existsSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";
import { copyFile, readdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromium, type FullConfig } from "@playwright/test";
import { ensureAdminUser } from "../../src/lib/auth/ensure-admin";

const FIXTURE_SRC = join(process.cwd(), "tests/e2e/fixtures/e2e-ru-only.md");
const FIXTURE_DEST = join(process.cwd(), "src/content/posts/e2e-ru-only.md");

export const installFixtures = async (): Promise<void> => {
  if (existsSync(FIXTURE_SRC) && !existsSync(FIXTURE_DEST)) {
    await copyFile(FIXTURE_SRC, FIXTURE_DEST);
  }
};

const POSTS_DIR = join(process.cwd(), "src/content/posts");

/**
 * Deletes every `e2e-*` post (RU + EN): the fixture above plus the scratch
 * posts the admin specs create. Runs at setup too, so an aborted run cannot
 * leave files behind that the content audits in `pnpm test` would flag.
 */
export const removeScratchPosts = async (): Promise<void> => {
  for (const dir of [POSTS_DIR, join(POSTS_DIR, "en")]) {
    if (!existsSync(dir)) continue;
    for (const name of await readdir(dir)) {
      if (name.startsWith("e2e-")) await rm(join(dir, name));
    }
  }
};

const DIST_PAGEFIND = resolve(process.cwd(), "dist", "client", "pagefind");
const PUBLIC_PAGEFIND = resolve(process.cwd(), "public", "pagefind");

/**
 * Ensures `dist/client/pagefind/pagefind.js` exists (required by the ⌘K
 * palette test) and is reachable at `/pagefind/...` from the Astro dev server
 * via a symlink in `public/`. Idempotent.
 */
function ensurePagefindArtifacts(): void {
  if (!existsSync(resolve(DIST_PAGEFIND, "pagefind.js"))) {
    // Build the site so Pagefind has something to index. ~30-60s on first run.
    execSync("pnpm build", { stdio: "inherit", cwd: process.cwd() });
  }
  if (existsSync(PUBLIC_PAGEFIND) || lstatExistsSafe(PUBLIC_PAGEFIND)) {
    // Refresh the symlink in case dist/ moved.
    unlinkSync(PUBLIC_PAGEFIND);
  }
  symlinkSync(DIST_PAGEFIND, PUBLIC_PAGEFIND, "dir");
}

function lstatExistsSafe(p: string): boolean {
  try {
    lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Seeds a predictable admin user for Playwright tests.
 *
 * Uses the same code path as `pnpm db:bootstrap-admin` — `signUpEmail` is
 * rejected because `emailAndPassword.disableSignUp` is on.
 */
const E2E_ADMIN = {
  email: "e2e-admin@test.dev",
  password: "e2e-admin-password",
  name: "E2E Admin",
} as const;

/**
 * The first visit to the React editor makes Vite discover and pre-bundle its
 * dependencies (CodeMirror, dnd-kit, diff, …) and then reload the page. Doing
 * that visit here means no admin spec races the reload — before this warm-up
 * the first save of a run regularly timed out on waitForResponse.
 */
const warmUpEditor = async (baseURL: string): Promise<void> => {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const signIn = await context.request.post("/api/auth/sign-in/email/", {
      headers: { Origin: baseURL },
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    if (!signIn.ok()) throw new Error(`editor warm-up: sign-in returned ${signIn.status()}`);
    const page = await context.newPage();
    for (let visit = 0; visit < 2; visit += 1) {
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await page.goto("/login/");
      await page.waitForLoadState("networkidle");
      await page.goto("/admin/posts/new/");
      await page.locator(".editor-shell").waitFor({ state: "visible", timeout: 60_000 });
      await page.waitForLoadState("networkidle");
    }
  } finally {
    await browser.close();
  }
};

export default async function globalSetup(config: FullConfig): Promise<void> {
  await removeScratchPosts();
  await installFixtures();
  ensurePagefindArtifacts();

  await ensureAdminUser(E2E_ADMIN);
  await warmUpEditor(config.projects[0]?.use.baseURL ?? "http://localhost:4321");
}
