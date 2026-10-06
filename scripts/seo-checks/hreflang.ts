import { getCounterpart } from "../../src/lib/i18n/paths";
import {
  absoluteUrl,
  canonicalsOf,
  hreflangCluster,
  isIndexable,
  localeOfRoute,
  type Alternate,
  type Dist,
  type Page,
} from "./dist";
import { fileOfPathname, isOnDemandPath } from "./on-demand";
import { grouped } from "./report";

const RULE = "hreflang";
const CODES: ReadonlySet<string> = new Set(["ru", "en", "x-default"]);

const clusterKey = (cluster: readonly Alternate[]): string =>
  cluster
    .map(({ code, href }) => `${code}=${href}`)
    .sort()
    .join(" ");

/**
 * The language cluster of a page is a promise about two pages, so it is checked from both sides:
 *
 *  1. one canonical, equal to the page's own address;
 *  2. only `ru` / `en` / `x-default`, each at most once (`en-US` would exclude every English
 *     reader outside the US: they fall through to x-default, the Russian page);
 *  3. a noindex page carries no cluster (a noindexed page must not be advertised as an alternate);
 *  4. an indexable page has a cluster exactly when its twin (`getCounterpart`) is built and
 *     indexable; a twin rendered on demand is skipped, dist cannot answer for it;
 *  5. the cluster is {own locale -> own canonical, other locale -> the twin, x-default -> RU};
 *  6. the twin declares the same cluster (reciprocity), and every alternate is a built page.
 *
 * Guard: a build in which no page declares a cluster checked nothing.
 */
export const checkHreflang = (dist: Dist): readonly string[] => {
  const findings: Array<readonly [string, string]> = [];
  const byRoute = new Map<string, Page>(dist.pages.map((page) => [page.route, page]));
  let pagesWithCluster = 0;

  for (const page of dist.pages) {
    const own = absoluteUrl(page.route);
    const canonicals = canonicalsOf(page);
    if (canonicals.length !== 1) {
      findings.push([`expected exactly one canonical, found ${canonicals.length}`, page.route]);
    } else if (canonicals[0] !== own) {
      findings.push([`canonical is ${canonicals[0]}, the page is ${own}`, page.route]);
    }

    const cluster = hreflangCluster(page);
    if (cluster.length > 0) pagesWithCluster += 1;

    for (const { code } of cluster) {
      if (!CODES.has(code)) {
        findings.push([`hreflang="${code}" is not one of ru, en, x-default`, page.route]);
      }
    }
    const codes = cluster.map(({ code }) => code);
    for (const code of new Set(codes.filter((value, index) => codes.indexOf(value) !== index))) {
      findings.push([`hreflang="${code}" is declared more than once`, page.route]);
    }

    if (!isIndexable(page)) {
      if (cluster.length > 0)
        findings.push(["a noindex page carries an hreflang cluster", page.route]);
      continue;
    }

    const locale = localeOfRoute(page.route);
    const twinRoute = getCounterpart(page.route, locale);
    if (!isOnDemandPath(twinRoute)) {
      const twin = byRoute.get(twinRoute);
      const twinUsable = twin !== undefined && isIndexable(twin);
      if (cluster.length > 0 && !twinUsable) {
        findings.push([
          `declares a cluster but its twin ${twinRoute} is ${twin === undefined ? "not built" : "noindex"}`,
          page.route,
        ]);
      }
      if (cluster.length === 0 && twinUsable) {
        findings.push([
          `its twin ${twinRoute} is built and indexable but no cluster is declared`,
          page.route,
        ]);
      }
      if (twin !== undefined && twinUsable && cluster.length > 0) {
        const twinCluster = hreflangCluster(twin);
        if (clusterKey(twinCluster) !== clusterKey(cluster)) {
          findings.push([`the cluster differs from the one on its twin ${twinRoute}`, page.route]);
        }
      }
    }

    if (cluster.length === 0) continue;

    const ru = locale === "ru" ? own : absoluteUrl(twinRoute);
    const en = locale === "en" ? own : absoluteUrl(twinRoute);
    const expected = new Map([
      ["ru", ru],
      ["en", en],
      ["x-default", ru],
    ]);
    for (const [code, href] of expected) {
      const declared = cluster.find((entry) => entry.code === code);
      if (declared === undefined) {
        findings.push([`the cluster has no hreflang="${code}" (expected ${href})`, page.route]);
      } else if (declared.href !== href) {
        findings.push([
          `hreflang="${code}" points at ${declared.href}, expected ${href}`,
          page.route,
        ]);
      }
    }

    for (const { href } of cluster) {
      const url = new URL(href, own);
      if (url.origin !== new URL(own).origin || isOnDemandPath(url.pathname)) continue;
      if (!dist.files.has(fileOfPathname(url.pathname))) {
        findings.push([
          `an alternate points at a page that was not built: ${url.pathname}`,
          page.route,
        ]);
      }
    }
  }

  const guard =
    pagesWithCluster === 0
      ? [`${RULE}: no built page declares an hreflang cluster: nothing was checked`]
      : [];
  return [...guard, ...grouped(RULE, findings)];
};
