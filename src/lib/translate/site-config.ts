import { join } from "node:path";

const ROOT = process.cwd();

export const PATHS = {
  postsDir: join(ROOT, "src/content/posts"),
  postsEnDir: join(ROOT, "src/content/posts/en"),
  siteDir: join(ROOT, "src/content/site"),
  siteEnDir: join(ROOT, "src/content/site/en"),
  projectsDir: join(ROOT, "src/content/projects"),
  projectsEnDir: join(ROOT, "src/content/projects/en"),
  i18nDir: join(ROOT, "src/i18n"),
} as const;

/**
 * Resolve a (collection, slug) tuple to the absolute RU and EN file paths.
 * Used by the runtime translate-one orchestrator and the publish action.
 *
 * Slug shape per collection:
 *   - posts:    "json-ld-graph-astro"
 *   - site:     "about" | "now" | "uses"
 *   - projects: "astro-blog"
 */
export type TranslateCollection = "posts" | "site" | "projects";

export interface CollectionPaths {
  readonly ruPath: string;
  readonly enPath: string;
  readonly extension: ".md" | ".mdx";
}

export const resolveCollectionPaths = (
  collection: TranslateCollection,
  slug: string,
): CollectionPaths => {
  switch (collection) {
    case "posts":
      return {
        ruPath: join(PATHS.postsDir, `${slug}.md`),
        enPath: join(PATHS.postsEnDir, `${slug}.md`),
        extension: ".md",
      };
    case "site":
      return {
        ruPath: join(PATHS.siteDir, `${slug}.md`),
        enPath: join(PATHS.siteEnDir, `${slug}.md`),
        extension: ".md",
      };
    case "projects":
      return {
        ruPath: join(PATHS.projectsDir, `${slug}.md`),
        enPath: join(PATHS.projectsEnDir, `${slug}.md`),
        extension: ".md",
      };
  }
};
