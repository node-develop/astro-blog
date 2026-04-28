import { join } from "node:path";

const ROOT = process.cwd();

export const PATHS = {
  postsDir: join(ROOT, "src/content/posts"),
  postsEnDir: join(ROOT, "src/content/posts/en"),
  siteDir: join(ROOT, "src/content/site"),
  siteEnDir: join(ROOT, "src/content/site/en"),
  i18nDir: join(ROOT, "src/i18n"),
} as const;
