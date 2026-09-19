import {
  buildPersonNode,
  buildOrganizationNode,
  buildWebSiteNode,
  type Locale,
} from "./nodes-global";
import type { GraphNode } from "./graph-types";

export type { GraphNode } from "./graph-types";

export interface GraphInput {
  readonly locale: Locale;
  readonly extraNodes: ReadonlyArray<GraphNode | null>;
}

export interface JsonLdGraph {
  readonly "@context": "https://schema.org";
  readonly "@graph": ReadonlyArray<GraphNode>;
}

export const buildGraph = (input: GraphInput): JsonLdGraph => {
  const globals: GraphNode[] = [
    buildPersonNode(),
    buildOrganizationNode(),
    buildWebSiteNode(input.locale),
  ];
  const extras = input.extraNodes.filter((n): n is GraphNode => n !== null);
  return {
    "@context": "https://schema.org",
    "@graph": [...globals, ...extras],
  };
};

export type { Locale } from "./nodes-global";
export { graphIds, websiteId } from "./nodes-global";
export { safeJsonLd } from "./json-ld";
export {
  buildBlogPostingNode,
  buildBreadcrumbListNode,
  buildBreadcrumbsNode,
  buildWebPageNode,
  buildPostItemListNode,
  itemListId,
  buildFaqPageNode,
  buildCourseNode,
  buildLearningResourceNode,
  courseId,
  lessonId,
  minutesToIsoDuration,
  parseWorkloadToIsoDuration,
  type BreadcrumbItem,
  type PostListEntry,
  type WebPageType,
} from "./nodes-page";
export { buildBlogNode } from "./nodes-global";
export { extractArticleBody, countWords } from "./article-body";
export { buildCollectionPageNode, buildCreativeWorkNode } from "./nodes-projects";
export { buildLandingNodes, type LandingScaffoldInput } from "./landing";
