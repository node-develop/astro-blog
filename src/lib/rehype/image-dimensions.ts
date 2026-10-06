import type { Element, Root } from "hast";
import type { Transformer } from "unified";
import { visit } from "unist-util-visit";

/**
 * Gives body images their intrinsic size so the page does not shift when they load.
 *
 * The Content API serializer writes `imageSizes: { "<url>": [width, height] }` into the article
 * header for every asset image in the body; this step reads it from the file's frontmatter
 * (the same hand-off `mermaid-figure.ts` uses for `lang`) and sets `width`/`height` on the `img`
 * whose `src` is that URL. An image that already has either attribute, or has no entry, is left
 * alone. The size is data the author's upload produced, so no network or file access happens here.
 */

type Size = readonly [number, number];

const isSize = (value: unknown): value is Size =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((n) => typeof n === "number" && Number.isInteger(n) && n > 0);

const sizesOf = (file: { data: Record<string, unknown> }): ReadonlyMap<string, Size> => {
  const astro = file.data["astro"] as { frontmatter?: Record<string, unknown> } | undefined;
  const raw = astro?.frontmatter?.["imageSizes"];
  if (typeof raw !== "object" || raw === null) return new Map();
  return new Map(Object.entries(raw).filter((entry): entry is [string, Size] => isSize(entry[1])));
};

const hasProperty = (element: Element, name: string): boolean =>
  Object.prototype.hasOwnProperty.call(element.properties, name);

const imageDimensions = (): Transformer<Root> => (tree, file) => {
  const sizes = sizesOf(file);
  if (sizes.size === 0) return;
  visit(tree, "element", (node) => {
    const element = node as Element;
    if (element.tagName !== "img" || typeof element.properties["src"] !== "string") return;
    if (hasProperty(element, "width") || hasProperty(element, "height")) return;
    const size = sizes.get(element.properties["src"]);
    if (size === undefined) return;
    element.properties["width"] = size[0];
    element.properties["height"] = size[1];
  });
};

export default imageDimensions;
