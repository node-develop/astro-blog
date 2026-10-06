import { XMLParser, XMLValidator } from "fast-xml-parser";
import { canonicalUrl } from "../../src/lib/seo/url-policy";
import {
  canonicalsOf,
  hreflangCluster,
  isIndexable,
  isPostRoute,
  SITEMAP_FILES,
  type Alternate,
  type Dist,
  type Page,
} from "./dist";
import { pageGraph } from "./jsonld";
import { fileOfPathname, isNoindexOnDemand, ON_DEMAND_SITEMAP } from "./on-demand";
import { grouped } from "./report";

const RULE = "sitemap";
const LOCAL_SITEMAPS = ["sitemap-ru.xml", "sitemap-en.xml"] as const;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
/** XMLValidator accepts `&nbsp;` and several roots; the sitemap protocol allows neither. */
const NON_PREDEFINED_ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);)/i;

type Entry = Readonly<{
  loc: string;
  lastmod: string | undefined;
  alternates: readonly Alternate[];
}>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  isArray: (name) => ["url", "sitemap", "xhtml:link"].includes(name),
});

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};

const strOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value.trim() : undefined;

const parseEntries = (xml: string, rootName: string, itemName: string): readonly Entry[] => {
  const parsed = asRecord(parser.parse(xml));
  const items = asRecord(parsed[rootName])[itemName];
  return (Array.isArray(items) ? items : []).map((raw): Entry => {
    const item = asRecord(raw);
    const links = item["xhtml:link"];
    return {
      loc: strOf(item["loc"]) ?? "",
      lastmod: strOf(item["lastmod"]),
      alternates: (Array.isArray(links) ? links : []).map((link) => ({
        code: strOf(asRecord(link)["@_hreflang"]) ?? "",
        href: strOf(asRecord(link)["@_href"]) ?? "",
      })),
    };
  });
};

const clusterKey = (cluster: readonly Alternate[]): string =>
  cluster
    .map(({ code, href }) => `${code}=${href}`)
    .sort()
    .join(" ");

const pathOf = (loc: string): string => {
  try {
    return new URL(loc).pathname;
  } catch {
    return loc;
  }
};

const dateModifiedOf = (page: Page, loc: string): string | undefined => {
  for (const node of pageGraph(page)) {
    const record = asRecord(node);
    const modified = record["dateModified"];
    const matches = isPostRoute(page.route)
      ? record["@type"] === "BlogPosting"
      : record["url"] === loc;
    if (matches && typeof modified === "string") return modified.slice(0, 10);
  }
  return undefined;
};

/**
 * The sitemaps are a second statement about the same addresses as the pages:
 *
 *  1. the three documents are well-formed XML, with one root and only the five predefined entities;
 *  2. the index lists exactly `sitemap-ru.xml` and `sitemap-en.xml`;
 *  3. every `<loc>` is unique, in canonical form, and either a built page or an indexable
 *     on-demand route; a noindex on-demand route (`/search/`, `/login/`, `/admin/`, `/api/`) is an error;
 *  4. the page of every `<loc>` is indexable and its own canonical;
 *  5. the `xhtml:link` cluster equals the cluster in the page's `<head>`;
 *  6. `lastmod` is `YYYY-MM-DD`; for a post it exists and equals `BlogPosting.dateModified`, for
 *     another page it is compared when the graph has a node for that URL with a `dateModified`.
 *
 * Stale on-demand exemptions are reported once by the orchestrator, not here.
 * Guard: each locale sitemap lists at least one `<loc>`.
 */
export const checkSitemaps = (dist: Dist): readonly string[] => {
  const findings: Array<readonly [string, string]> = [];
  const own = (file: string): readonly [string, string] | null => {
    const xml = dist.xml.get(file);
    return xml === undefined ? null : [file, xml];
  };

  for (const file of SITEMAP_FILES) {
    if (!dist.xml.has(file)) findings.push(["the sitemap is missing from the build", file]);
  }

  const wellFormed = new Set<string>();
  for (const file of SITEMAP_FILES) {
    const found = own(file);
    if (found === null) continue;
    const [, xml] = found;
    const validity = XMLValidator.validate(xml);
    if (validity !== true) {
      findings.push([`not well-formed XML: ${validity.err.msg}`, file]);
      continue;
    }
    if (NON_PREDEFINED_ENTITY.test(xml)) {
      findings.push([
        "uses an entity XML does not predefine (only &amp; &lt; &gt; &quot; &apos;)",
        file,
      ]);
      continue;
    }
    const roots = Object.keys(asRecord(parser.parse(xml))).filter((key) => !key.startsWith("?"));
    const expectedRoot = file === "sitemap-index.xml" ? "sitemapindex" : "urlset";
    if (roots.length !== 1 || roots[0] !== expectedRoot) {
      findings.push([
        `root must be a single <${expectedRoot}>, found ${roots.join(", ") || "none"}`,
        file,
      ]);
      continue;
    }
    wellFormed.add(file);
  }

  if (wellFormed.has("sitemap-index.xml")) {
    const listed = parseEntries(dist.xml.get("sitemap-index.xml") ?? "", "sitemapindex", "sitemap");
    const expected = LOCAL_SITEMAPS.map((file) => canonicalUrl(`/${file}`));
    for (const url of expected.filter((url) => !listed.some(({ loc }) => loc === url))) {
      findings.push([`the index does not list ${url}`, "sitemap-index.xml"]);
    }
    for (const { loc } of listed.filter(({ loc }) => !expected.includes(loc))) {
      findings.push([`the index lists ${loc}, which is not a local sitemap`, "sitemap-index.xml"]);
    }
    for (const { lastmod } of listed) {
      if (lastmod !== undefined && !DATE_ONLY.test(lastmod)) {
        findings.push([
          `lastmod ${JSON.stringify(lastmod)} is not YYYY-MM-DD`,
          "sitemap-index.xml",
        ]);
      }
    }
  }

  const byRoute = new Map<string, Page>(dist.pages.map((page) => [page.route, page]));
  const seen = new Set<string>();

  for (const file of LOCAL_SITEMAPS) {
    if (!wellFormed.has(file)) continue;
    const entries = parseEntries(dist.xml.get(file) ?? "", "urlset", "url");
    if (entries.length === 0) {
      findings.push(["lists no <loc> at all: nothing was checked", file]);
      continue;
    }

    for (const entry of entries) {
      const where = `${file}: ${entry.loc}`;
      const pathname = pathOf(entry.loc);
      if (seen.has(entry.loc)) findings.push(["a <loc> is listed twice", where]);
      seen.add(entry.loc);

      if (entry.loc !== canonicalUrl(pathname)) {
        findings.push([
          `<loc> is not in canonical form (expected ${canonicalUrl(pathname)})`,
          where,
        ]);
        continue;
      }
      if (isNoindexOnDemand(pathname)) {
        findings.push(["a route that must not be indexed is in the sitemap", where]);
        continue;
      }

      const page = byRoute.get(pathname);
      if (page === undefined) {
        if (!ON_DEMAND_SITEMAP.includes(pathname) && !dist.files.has(fileOfPathname(pathname))) {
          findings.push(["<loc> has no file in the build", where]);
        }
        continue;
      }

      if (!isIndexable(page)) findings.push(["<loc> is a noindex page", where]);
      const canonicals = canonicalsOf(page);
      if (canonicals.length !== 1 || canonicals[0] !== entry.loc) {
        findings.push([
          `<loc> is not the page's canonical (${canonicals.join(", ") || "none"})`,
          where,
        ]);
      }
      if (clusterKey(entry.alternates) !== clusterKey(hreflangCluster(page))) {
        findings.push([
          "the sitemap hreflang cluster differs from the one in the page <head>",
          where,
        ]);
      }

      if (entry.lastmod !== undefined && !DATE_ONLY.test(entry.lastmod)) {
        findings.push([`lastmod ${JSON.stringify(entry.lastmod)} is not YYYY-MM-DD`, where]);
        continue;
      }
      const modified = dateModifiedOf(page, entry.loc);
      if (isPostRoute(pathname) && entry.lastmod === undefined) {
        findings.push(["a post has no lastmod", where]);
      } else if (
        modified !== undefined &&
        entry.lastmod !== undefined &&
        entry.lastmod !== modified
      ) {
        findings.push([`lastmod ${entry.lastmod} differs from dateModified ${modified}`, where]);
      }
    }
  }

  return grouped(RULE, findings);
};
