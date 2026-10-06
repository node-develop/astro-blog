import { CANONICAL_ORIGIN } from "../../src/lib/seo/url-policy";
import { absoluteUrl, attr, queryAll, type Dist, type Page } from "./dist";
import { fileOfPathname, isOnDemandPath, isRuntimeVolumePath } from "./on-demand";
import { grouped } from "./report";

const RULE = "links";
const SKIPPED_LINK_RELS: ReadonlySet<string> = new Set(["preconnect", "dns-prefetch"]);

const urlsOfSrcset = (srcset: string): readonly string[] =>
  srcset
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
    .filter((url) => url !== "");

/**
 * Every URL a page asks for: links, images (src and srcset), stylesheets and scripts. Links
 * inside an article body (`.prose a`) are left out: authors write them, the Content API only
 * checks their form, and a link to an unpublished article must not fail a whole release.
 */
const referencesOf = (page: Page): readonly string[] => {
  const proseLinks = new Set(queryAll(page, ".prose a[href]"));
  return [
    ...queryAll(page, "a[href]")
      .filter((el) => !proseLinks.has(el))
      .flatMap((el) => attr(el, "href") ?? []),
    ...queryAll(page, "img[src]").flatMap((el) => attr(el, "src") ?? []),
    ...queryAll(page, "img[srcset], source[srcset]").flatMap((el) =>
      urlsOfSrcset(attr(el, "srcset") ?? ""),
    ),
    ...queryAll(page, "link[href]")
      .filter(
        (el) => !(attr(el, "rel") ?? "").split(/\s+/).some((rel) => SKIPPED_LINK_RELS.has(rel)),
      )
      .flatMap((el) => attr(el, "href") ?? []),
    ...queryAll(page, "script[src]").flatMap((el) => attr(el, "src") ?? []),
  ];
};

const idsOf = (page: Page): ReadonlySet<string> =>
  new Set([
    ...queryAll(page, "[id]").flatMap((el) => attr(el, "id") ?? []),
    ...queryAll(page, "a[name]").flatMap((el) => attr(el, "name") ?? []),
  ]);

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

/**
 * Internal links resolve offline against the build. A reference is internal when it resolves to
 * the canonical origin (root-relative, relative to the page, or absolute `https://artka.dev`):
 *
 *  1. its path is a file of the build; on-demand routes and the runtime uploads volume are
 *     exempt (`on-demand.ts`);
 *  2. a `#fragment` names an `id` (or `a[name]`) on the target HTML page; a bare `#` and a
 *     target rendered on demand are not checked.
 *
 * External links are not followed. Stale on-demand exemptions are reported once by the orchestrator.
 * Guard: at least one internal reference was checked.
 */
export const checkInternalLinks = (dist: Dist): readonly string[] => {
  const findings: Array<readonly [string, string]> = [];
  const byRoute = new Map<string, Page>(dist.pages.map((page) => [page.route, page]));
  const idCache = new Map<string, ReadonlySet<string>>();
  const idsOfRoute = (route: string): ReadonlySet<string> | undefined => {
    const cached = idCache.get(route);
    if (cached !== undefined) return cached;
    const page = byRoute.get(route);
    if (page === undefined) return undefined;
    const ids = idsOf(page);
    idCache.set(route, ids);
    return ids;
  };
  const origin = new URL(CANONICAL_ORIGIN).origin;
  let checked = 0;

  for (const page of dist.pages) {
    for (const href of new Set(referencesOf(page))) {
      let url: URL;
      try {
        url = new URL(href, absoluteUrl(page.route));
      } catch {
        findings.push(["the reference is not a valid URL", `${page.route} -> ${href}`]);
        continue;
      }
      if ((url.protocol !== "http:" && url.protocol !== "https:") || url.origin !== origin)
        continue;

      const where = `${page.route} -> ${href}`;
      const pathname = safeDecode(url.pathname);
      if (isOnDemandPath(pathname) || isRuntimeVolumePath(pathname)) continue;
      checked += 1;

      const file = fileOfPathname(pathname);
      if (!dist.files.has(file)) {
        findings.push(["the link points at a path that is not in the build", where]);
        continue;
      }

      const fragment = safeDecode(url.hash.slice(1));
      if (fragment === "" || fragment.startsWith(":~:") || !file.endsWith(".html")) continue;
      const ids = idsOfRoute(pathname);
      if (ids !== undefined && !ids.has(fragment)) {
        findings.push([`the target page has no element with id "${fragment}"`, where]);
      }
    }
  }

  const guard =
    checked === 0
      ? [`${RULE}: no internal reference was found in the build: nothing was checked`]
      : [];
  return [...guard, ...grouped(RULE, findings)];
};
