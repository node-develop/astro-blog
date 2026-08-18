import type { Element, Root } from "hast";
import type { Transformer } from "unified";
import { visit } from "unist-util-visit";

const hasProperty = (element: Element, name: string): boolean =>
  Object.prototype.hasOwnProperty.call(element.properties, name);

const hasExplicitLoadingPolicy = (element: Element): boolean =>
  hasProperty(element, "dataEager") ||
  hasProperty(element, "data-eager") ||
  hasProperty(element, "loading") ||
  hasProperty(element, "fetchPriority") ||
  hasProperty(element, "fetchpriority");

const lazyContentImages = (): Transformer<Root> => (tree) => {
  visit(tree, "element", (node) => {
    const element = node as Element;
    if (element.tagName !== "img" || hasExplicitLoadingPolicy(element)) return;

    element.properties.loading = "lazy";
    if (!hasProperty(element, "decoding")) element.properties.decoding = "async";
  });
};

export default lazyContentImages;
