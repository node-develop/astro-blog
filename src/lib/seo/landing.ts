import {
  buildBreadcrumbsNode,
  buildWebPageNode,
  type BreadcrumbItem,
  type WebPageType,
} from "./nodes-page";
import type { GraphNode } from "./graph-types";
import type { Locale } from "./nodes-global";

export interface LandingScaffoldInput {
  readonly locale: Locale;
  readonly canonical: string;
  readonly name: string;
  readonly description: string;
  /**
   * Breadcrumb trail. Last item must NOT have an href — it's the current
   * page (matches Schema.org BreadcrumbList semantics). The helper builds
   * both the visible-friendly items and the JSON-LD node from this single
   * source of truth.
   */
  readonly breadcrumb: ReadonlyArray<BreadcrumbItem>;
  readonly type?: WebPageType;
  readonly primaryImageOfPage?: string;
  readonly dateModified?: Date | null;
}

/**
 * Pair of JSON-LD nodes to feed BaseLayout's `extraSchemaNodes` for any
 * landing-style page (entity, archive, course landing, …). The visible
 * <Breadcrumbs> component should be rendered separately with the same
 * `breadcrumb` items so the visual trail and the JSON-LD agree.
 */
export const buildLandingNodes = (input: LandingScaffoldInput): ReadonlyArray<GraphNode> => {
  const breadcrumbsNode = buildBreadcrumbsNode({
    canonical: input.canonical,
    items: input.breadcrumb,
  }) as GraphNode;

  const webPageNode = buildWebPageNode({
    locale: input.locale,
    canonical: input.canonical,
    name: input.name,
    description: input.description,
    type: input.type ?? "WebPage",
    breadcrumbId: `${input.canonical}#breadcrumbs`,
    ...(input.primaryImageOfPage ? { primaryImageOfPage: input.primaryImageOfPage } : {}),
    ...(input.dateModified ? { dateModified: input.dateModified } : {}),
  }) as GraphNode;

  return [breadcrumbsNode, webPageNode];
};
