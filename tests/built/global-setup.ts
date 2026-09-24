import { existsSync } from "node:fs";
import { join } from "node:path";

// The `built` project reads dist/ and boots dist/server/entry.mjs. Without a
// build every file would fail on its own ENOENT (or, worse, pass on a stale
// build), so refuse to start instead. CI runs `pnpm verify:seo-build` first.
const REQUIRED = [
  "dist/client/sitemap-ru.xml",
  "dist/client/sitemap-en.xml",
  "dist/server/entry.mjs",
] as const;

export default function assertFreshBuild(): void {
  const missing = REQUIRED.filter((file) => !existsSync(join(process.cwd(), file)));
  if (missing.length > 0) {
    throw new Error(
      `tests/built needs a production build (missing: ${missing.join(", ")}). ` +
        "Run `pnpm build` (or `pnpm verify:seo-build`) first.",
    );
  }
}
