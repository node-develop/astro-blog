import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";

export const E2E_ADMIN = {
  email: "e2e-admin@test.dev",
  password: "e2e-admin-password",
  name: "E2E Admin",
} as const;

const POSTS_DIR = join(process.cwd(), "src/content/posts");

export const postPath = (slug: string): string => join(POSTS_DIR, `${slug}.md`);

/**
 * Signs in through the form. A content-layer reload broadcast by the dev
 * server (the previous spec's cleanup just deleted a file) can land on the
 * login page mid-typing and drop the form values, so one more attempt is made
 * when the first submit leaves the page on /login/.
 */
export const login = async (page: Page): Promise<void> => {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await gotoWithRetry(page, "/login/");
    await page.locator('input[name="email"]').fill(E2E_ADMIN.email);
    await page.locator('input[name="password"]').fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: /войти/i }).click();
    try {
      await expect(page).toHaveURL(/\/admin\/posts\//, { timeout: 10_000 });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
    }
  }
};

/** Navigates with retries to ride out dev-server HMR aborts between steps. */
export const gotoWithRetry = async (page: Page, url: string, maxAttempts = 3): Promise<void> => {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "load", timeout: 10_000 });
      return;
    } catch (error) {
      if (attempt === maxAttempts) {
        throw new Error(
          `Failed to navigate to ${url} after ${maxAttempts} attempts: ${String(error)}`,
        );
      }
      await page.waitForTimeout(1_000);
    }
  }
};

export const saveButton = (page: Page): Locator => page.getByRole("button", { name: /сохранить/i });

/**
 * Waits until the React island whose component-url contains `name` is
 * hydrated. Island markup is already in the SSR HTML, so typing or dragging
 * before hydration is lost (React resets inputs to its own empty state, Save
 * then fails validation without calling the action). Astro drops the island's
 * `ssr` attribute once hydration finishes.
 */
export const waitForIsland = async (page: Page, name: string): Promise<void> => {
  await page
    .locator(`astro-island[component-url*="${name}"]:not([ssr])`)
    .waitFor({ state: "attached", timeout: 30_000 });
};

export const waitForEditor = async (page: Page): Promise<void> => {
  await waitForIsland(page, "EditorShell");
  await page.locator(".editor-shell").waitFor({ state: "visible" });
};

/**
 * Clicks an action button and waits for its response — or for a full page load.
 *
 * Writing a content file makes the Astro dev server re-sync the content layer
 * and broadcast a full-reload; when that lands before the action response the
 * browser drops the in-flight fetch even though the server already applied the
 * change (dev log: `POST /_actions/posts.upsert/` immediately followed by
 * `[glob-loader] Reloaded data from …`). Callers therefore verify the outcome —
 * the file on disk, the UI state — rather than trusting the response alone.
 */
export const clickAction = async (
  page: Page,
  button: Locator,
  actionPath = "_actions/posts",
): Promise<"response" | "reloaded"> => {
  const response = page
    .waitForResponse((res) => res.url().includes(actionPath), { timeout: 15_000 })
    .then(() => "response" as const);
  const reloaded = page.waitForEvent("load", { timeout: 15_000 }).then(() => "reloaded" as const);
  // Only the winner matters; keep the loser from surfacing as an unhandled rejection.
  response.catch(() => undefined);
  reloaded.catch(() => undefined);
  await button.click();
  return Promise.race([response, reloaded]);
};

/** Polls the post's Markdown file on disk until `predicate` holds. */
export const expectPostFile = async (
  slug: string,
  predicate: (raw: string) => boolean = () => true,
  message = `post ${slug} written to disk`,
): Promise<void> => {
  await expect
    .poll(
      async () => existsSync(postPath(slug)) && predicate(await readFile(postPath(slug), "utf8")),
      { timeout: 15_000, message },
    )
    .toBe(true);
};

/** Opens (or confirms) the editor of `slug` and waits for the React island. */
export const openPostEditor = async (page: Page, slug: string): Promise<void> => {
  const target = new RegExp(`/admin/posts/${slug}/$`);
  if (!target.test(page.url())) await gotoWithRetry(page, `/admin/posts/${slug}/`);
  await expect(page).toHaveURL(target, { timeout: 10_000 });
  await waitForEditor(page);
};

const scratchSlugs: string[] = [];

/**
 * Creates an `e2e-<prefix>-<timestamp>` post through the editor UI — the same
 * path an author takes — and leaves the page on its edit URL. Register
 * `cleanupScratchPosts` as `test.afterEach` so later specs never see it.
 */
export const createScratchPost = async (
  page: Page,
  prefix: string,
  title = `E2E ${prefix} post`,
): Promise<string> => {
  const slug = `e2e-${prefix}-${Date.now()}`;
  scratchSlugs.push(slug);
  await gotoWithRetry(page, "/admin/posts/new/");
  await waitForEditor(page);
  // New-post form: slug is the first text input, title the second, description the first textarea.
  const slugInput = page.locator('input[type="text"]').first();
  await slugInput.fill(slug);
  await expect(slugInput).toHaveValue(slug);
  await page.locator('input[type="text"]').nth(1).fill(title);
  await page.locator("textarea").first().fill(`Scratch post created by the ${prefix} e2e spec.`);
  await clickAction(page, saveButton(page));
  await expectPostFile(slug, (raw) => raw.includes(title));
  await openPostEditor(page, slug);
  return slug;
};

/** Removes every scratch post this worker created (RU + EN twins). */
export const cleanupScratchPosts = async (): Promise<void> => {
  const slugs = scratchSlugs.splice(0);
  for (const slug of slugs) {
    for (const path of [postPath(slug), join(POSTS_DIR, "en", `${slug}.md`)]) {
      await rm(path, { force: true });
    }
  }
  // Give the dev server time to re-sync and broadcast its reload before the
  // next spec opens a page that would otherwise catch it mid-interaction.
  if (slugs.length > 0) await new Promise((resolve) => setTimeout(resolve, 1_500));
};
