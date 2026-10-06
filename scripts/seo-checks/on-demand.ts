import type { Dist } from "./dist";

/**
 * Routes the production server renders per request: they have no file in `dist/client`, so a
 * check that resolves URLs against the build output must be told about them. Two groups with
 * opposite sitemap semantics: a sitemap `<loc>` may name the first group, never the second.
 */

/** Rendered on demand and indexable: legitimate sitemap entries without a dist file. */
export const ON_DEMAND_SITEMAP: readonly string[] = ["/", "/en/", "/blog/", "/en/blog/"];

/** Rendered on demand and not for search engines: a sitemap `<loc>` here is an error. */
export const ON_DEMAND_NOINDEX: readonly string[] = [
  "/search/",
  "/en/search/",
  "/login/",
  "/llms.txt",
  "/llms-full.txt",
];

export const ON_DEMAND_ROUTES: readonly string[] = [...ON_DEMAND_SITEMAP, ...ON_DEMAND_NOINDEX];

export const ON_DEMAND_PREFIXES: readonly string[] = ["/api/", "/admin/", "/blog/partials/"];

/**
 * Files the server writes and serves at runtime from a persistent volume (`UPLOADS_DIR`): they are
 * not in the build, and the post-deploy smoke checks them against the live site.
 */
export const RUNTIME_VOLUME_PREFIXES: readonly string[] = ["/uploads/"];

export const isOnDemandPath = (pathname: string): boolean =>
  ON_DEMAND_ROUTES.includes(pathname) ||
  ON_DEMAND_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export const isNoindexOnDemand = (pathname: string): boolean =>
  ON_DEMAND_NOINDEX.includes(pathname) ||
  ON_DEMAND_PREFIXES.some((prefix) => pathname.startsWith(prefix));

export const isRuntimeVolumePath = (pathname: string): boolean =>
  RUNTIME_VOLUME_PREFIXES.some((prefix) => pathname.startsWith(prefix));

/** The dist file a pathname resolves to: `/blog/x/` -> `blog/x/index.html`, `/rss.xml` -> `rss.xml`. */
export const fileOfPathname = (pathname: string): string => {
  const bare = pathname.replace(/^\//, "");
  return bare === "" || bare.endsWith("/") ? `${bare}index.html` : bare;
};

/**
 * An exemption that has outlived its reason: a route listed as on demand that now has a file in
 * the build is a route that became static, and the list must follow. Called once by the orchestrator.
 */
export const staleExemptions = (dist: Dist): readonly string[] =>
  ON_DEMAND_ROUTES.filter((route) => dist.files.has(fileOfPathname(route))).map(
    (route) =>
      `${route} is listed as rendered on demand but dist has ${fileOfPathname(route)}: remove it from scripts/seo-checks/on-demand.ts`,
  );
