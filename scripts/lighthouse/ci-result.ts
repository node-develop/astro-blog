import type { ExportSnapshot } from "../../src/lib/content-api/contract";

/**
 * The three pages Unlighthouse scans on a pull request: the SSR home, a RU post and its EN twin.
 * The first RU article that is listed (not hidden) and has a listed EN twin under the same slug.
 */
export const lighthousePaths = (snapshot: ExportSnapshot): readonly string[] => {
  const listed = snapshot.articles.filter((article) => !article.meta.hiddenFromList);
  const english = new Set(listed.filter((a) => a.lang === "en").map((a) => a.slug));
  const slug = listed.find((a) => a.lang === "ru" && english.has(a.slug))?.slug;
  if (slug === undefined) {
    throw new Error("the snapshot has no listed RU article with a listed EN twin to scan");
  }
  return ["/", `/blog/${slug}/`, `/en/blog/${slug}/`];
};

const CATEGORIES = ["performance", "accessibility", "seo"] as const;

const withoutTrailingSlash = (path: string): string =>
  path === "/" ? path : path.replace(/\/$/, "");

/**
 * Unlighthouse exits 0 for a route whose report has no categories (it skips them in the budget
 * loop), so the budget alone cannot prove a page was scanned. Every expected path must be in
 * `ci-result.json` with a numeric score for each budgeted category.
 */
export const checkCiResult = (
  result: unknown,
  expectedPaths: readonly string[],
): readonly string[] => {
  if (!Array.isArray(result)) return ["ci-result.json is not an array of reports"];
  const rows = result.filter(
    (row): row is Readonly<Record<string, unknown>> => typeof row === "object" && row !== null,
  );
  return expectedPaths.flatMap((path) => {
    const row = rows.find(
      (candidate) =>
        typeof candidate.path === "string" &&
        withoutTrailingSlash(candidate.path) === withoutTrailingSlash(path),
    );
    if (!row) return [`${path}: no report in ci-result.json (the page was not scanned)`];
    return CATEGORIES.filter(
      (category) => typeof row[category] !== "number" || Number.isNaN(row[category]),
    ).map((category) => `${path}: no numeric ${category} score`);
  });
};
