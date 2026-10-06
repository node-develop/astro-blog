import { isLocale } from "../../src/i18n";
import { findDanglingGraphRefs, graphNodesOf } from "../../src/lib/seo/graph-refs";
import { validatePageGraph } from "../../src/lib/seo/graph-schema";
import {
  absoluteUrl,
  attr,
  canonicalsOf,
  isPostRoute,
  jsonLdBlocks,
  query,
  type Dist,
  type Page,
} from "./dist";
import { grouped } from "./report";

const RULE = "json-ld";

/** The nodes of every parseable JSON-LD block of a page; a block that does not parse adds nothing. */
export const pageGraph = (page: Page): readonly unknown[] =>
  jsonLdBlocks(page).flatMap((block): readonly unknown[] => {
    try {
      return graphNodesOf(JSON.parse(block));
    } catch {
      // Reported once, with the page, by checkJsonLd; callers here only need the nodes.
      return [];
    }
  });

/**
 * Every JSON-LD block of every built page parses, the page's graph keeps the contract in
 * `src/lib/seo/graph-schema.ts` (types, one Person, BlogPosting fields, breadcrumb positions) and
 * resolves against itself (`findDanglingGraphRefs`). The server-rendered pages (`/`, `/blog/`, and
 * their EN twins) are not in dist; the production smoke test feeds the same two functions.
 * A page without JSON-LD is fine; a build without any means the extractor went blind.
 */
export const checkJsonLd = (dist: Dist): readonly string[] => {
  const findings: Array<readonly [string, string]> = [];
  let pagesWithJsonLd = 0;

  for (const page of dist.pages) {
    const blocks = jsonLdBlocks(page);
    if (blocks.length === 0) continue;
    pagesWithJsonLd += 1;

    const html = query(page, "html");
    const lang = html === undefined ? undefined : attr(html, "lang");
    if (!isLocale(lang)) {
      findings.push([
        `carries JSON-LD but <html lang> is ${JSON.stringify(lang ?? null)}, not a site locale`,
        page.route,
      ]);
      continue;
    }

    const graph: unknown[] = [];
    blocks.forEach((block, index) => {
      try {
        graph.push(...graphNodesOf(JSON.parse(block)));
      } catch (error) {
        findings.push([
          `JSON-LD block ${index + 1} does not parse (${error instanceof Error ? error.message : String(error)})`,
          page.route,
        ]);
      }
    });
    if (graph.length === 0) continue;

    for (const ref of findDanglingGraphRefs({ graph, locale: lang })) {
      findings.push([`dangling reference ${ref.path} -> ${ref.id}`, page.route]);
    }
    for (const issue of validatePageGraph({
      graph,
      locale: lang,
      canonical: canonicalsOf(page)[0] ?? absoluteUrl(page.route),
      isPost: isPostRoute(page.route),
    })) {
      findings.push([issue, page.route]);
    }
  }

  const guard =
    pagesWithJsonLd === 0
      ? [
          `${RULE}: no JSON-LD block found in any of ${dist.pages.length} built page(s) under ${dist.root}: nothing was checked`,
        ]
      : [];
  return [...guard, ...grouped(RULE, findings)];
};
