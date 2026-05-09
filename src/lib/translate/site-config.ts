import { join } from "node:path";

const ROOT = process.cwd();

export const PATHS = {
  postsDir: join(ROOT, "src/content/posts"),
  postsEnDir: join(ROOT, "src/content/posts/en"),
  siteDir: join(ROOT, "src/content/site"),
  siteEnDir: join(ROOT, "src/content/site/en"),
  projectsDir: join(ROOT, "src/content/projects"),
  projectsEnDir: join(ROOT, "src/content/projects/en"),
  // Courses collection holds both the course landing (`<slug>/_index.md`) and
  // its lessons (`<slug>/<NN>-<title>.md`). EN twins go to `<slug>/en/...`.
  coursesDir: join(ROOT, "src/content/courses"),
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
 *   - courses:  "claude-code-guide"
 *               (resolves to `<slug>/_index.md` — the landing page)
 *   - lessons:  "claude-code-guide/01-introduction"
 *               (course slug + lesson slug, slash-separated)
 */
export type TranslateCollection = "posts" | "site" | "projects" | "courses" | "lessons";

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
    case "courses":
      // Course landing page: <slug>/_index.md → en/<slug>/en/_index.md
      return {
        ruPath: join(PATHS.coursesDir, slug, "_index.md"),
        enPath: join(PATHS.coursesDir, slug, "en", "_index.md"),
        extension: ".md",
      };
    case "lessons": {
      // "claude-code-guide/01-introduction" → split into course/lesson.
      const idx = slug.indexOf("/");
      if (idx <= 0 || idx === slug.length - 1) {
        throw new Error(`Lesson slug must be '<course>/<lesson>'; got '${slug}'`);
      }
      const course = slug.slice(0, idx);
      const lesson = slug.slice(idx + 1);
      return {
        ruPath: join(PATHS.coursesDir, course, `${lesson}.md`),
        enPath: join(PATHS.coursesDir, course, "en", `${lesson}.md`),
        extension: ".md",
      };
    }
  }
};
