import { execSync } from "node:child_process";
import { existsSync, lstatSync, symlinkSync, unlinkSync } from "node:fs";
import { copyFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FullConfig } from "@playwright/test";
import { eq } from "drizzle-orm";
import { auth } from "../../src/lib/auth";
import { db } from "../../src/lib/db";
import { users } from "../../src/lib/db/schema";

const FIXTURE_SRC = join(process.cwd(), "tests/e2e/fixtures/e2e-ru-only.md");
const FIXTURE_DEST = join(process.cwd(), "src/content/posts/e2e-ru-only.md");

export const installFixtures = async (): Promise<void> => {
  if (existsSync(FIXTURE_SRC) && !existsSync(FIXTURE_DEST)) {
    await copyFile(FIXTURE_SRC, FIXTURE_DEST);
  }
};

export const removeFixtures = async (): Promise<void> => {
  if (existsSync(FIXTURE_DEST)) {
    await rm(FIXTURE_DEST);
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
 */
export default async function globalSetup(_config: FullConfig): Promise<void> {
  await installFixtures();
  ensurePagefindArtifacts();

  const email = "e2e-admin@test.dev";
  const existing = await db.select().from(users).where(eq(users.email, email));
  if (existing.length === 0) {
    try {
      await auth.api.signUpEmail({
        body: { email, password: "e2e-admin-password", name: "E2E Admin" },
      });
    } catch (err) {
      // Ignore "user already exists" race — the upsert below handles it.
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.toLowerCase().includes("already")) throw err;
    }
  }
  await db.update(users).set({ role: "admin" }).where(eq(users.email, email));
}
