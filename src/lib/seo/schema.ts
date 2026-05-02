import {
  buildPersonNode,
  buildOrganizationNode,
  buildWebSiteNode,
  type Locale,
} from "./nodes-global";

export type GraphNode = Record<string, unknown> & { "@type": string };

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
export { graphIds } from "./nodes-global";
export { safeJsonLd } from "./json-ld";
export {
  buildBlogPostingNode,
  buildBreadcrumbListNode,
  buildWebPageNode,
  buildFaqPageNode,
} from "./nodes-page";
export { buildBlogNode } from "./nodes-global";
export { extractArticleBody, countWords } from "./article-body";
export { buildCollectionPageNode, buildCreativeWorkNode } from "./nodes-projects";
