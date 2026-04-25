import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { logger } from "~/lib/logger";

export const REBUILD_DEBOUNCE_MS = 30_000;

let timer: NodeJS.Timeout | null = null;
let pendingSlugs = new Set<string>();

const DIST_DIR = resolve(process.cwd(), "dist");

/**
 * Schedule a Pagefind rebuild against `dist/`. Calls within the debounce
 * window collapse into a single rebuild. No-op if `dist/` does not exist
 * (i.e., during `astro dev` without a prior `pnpm build`).
 */
export function schedulePagefindRebuild(slug: string): void {
  if (!existsSync(DIST_DIR)) {
    logger.debug({ slug }, "pagefind: skip rebuild — no dist/");
    return;
  }
  pendingSlugs.add(slug);
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const slugs = [...pendingSlugs];
    pendingSlugs = new Set();
    timer = null;
    runRebuild(slugs);
  }, REBUILD_DEBOUNCE_MS);
}

function runRebuild(slugs: readonly string[]): void {
  logger.info({ slugs }, "pagefind: rebuilding");
  const child = spawn("pnpm", ["pagefind:rebuild"], {
    stdio: "inherit",
    cwd: process.cwd(),
  });
  child.on("error", (err) => {
    logger.warn({ err }, "pagefind: rebuild spawn failed");
  });
  child.on("exit", (code) => {
    if (code !== 0) {
      logger.warn({ code }, "pagefind: rebuild exited non-zero");
    } else {
      logger.info("pagefind: rebuild ok");
    }
  });
}

/** Test-only: clears pending state. */
export function __testReset(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  pendingSlugs = new Set();
}
