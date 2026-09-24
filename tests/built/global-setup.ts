import { existsSync } from "node:fs";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { startProductionServer, stopServer } from "../support/production-server";

declare module "vitest" {
  export interface ProvidedContext {
    /** Origin of the standalone server shared by every `built` file (see below). */
    siteOrigin: string;
  }
}

// The `built` project reads dist/ and boots dist/server/entry.mjs. Without a
// build every file would fail on its own ENOENT (or, worse, pass on a stale
// build), so refuse to start instead. CI runs `pnpm verify:seo-build` first.
const REQUIRED = [
  "dist/client/sitemap-ru.xml",
  "dist/client/sitemap-en.xml",
  "dist/server/entry.mjs",
] as const;

const assertFreshBuild = (): void => {
  const missing = REQUIRED.filter((file) => !existsSync(join(process.cwd(), file)));
  if (missing.length > 0) {
    throw new Error(
      `tests/built needs a production build (missing: ${missing.join(", ")}). ` +
        "Run `pnpm build` (or `pnpm verify:seo-build`) first.",
    );
  }
};

// One standalone server for the whole project instead of one per file: the
// pages are read-only, so files can share it (`inject("siteOrigin")`). Only
// production-server.smoke.test.ts boots its own, because it asserts on the
// server's startup and log output.
export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  assertFreshBuild();
  const server = await startProductionServer({
    host: "127.0.0.1",
    siteUrl: "https://artka.dev",
    auth: "test",
  });
  project.provide("siteOrigin", server.origin);
  return async () => {
    await stopServer(server.child);
  };
}
