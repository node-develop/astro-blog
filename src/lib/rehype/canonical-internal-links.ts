import type { Element, Root } from "hast";
import type { Transformer } from "unified";
import { visit } from "unist-util-visit";
import { CANONICAL_ORIGIN, canonicalPath, isFileLikePath } from "../seo/url-policy";

export const canonicalInternalHref = (href: string): string => {
  if (
    href.startsWith("#") ||
    href.startsWith("?") ||
    href.startsWith("//") ||
    /^(?:mailto|tel):/i.test(href)
  ) {
    return href;
  }

  if (/^https?:\/\//i.test(href)) {
    const parsed = new URL(href);
    if (parsed.hostname !== "artka.dev" || isFileLikePath(parsed.pathname)) return href;
    return `${CANONICAL_ORIGIN}${canonicalPath(parsed.pathname)}${parsed.hash}`;
  }

  if (!href.startsWith("/") && !href.startsWith("./") && !href.startsWith("../")) return href;
  if (isFileLikePath(href)) return href;

  const hash = new URL(href, CANONICAL_ORIGIN).hash;
  const path = href.split(/[?#]/, 1)[0] ?? href;
  if (path.startsWith("/")) return `${canonicalPath(path)}${hash}`;

  const collapsed = path.replace(/\/{2,}/g, "/");
  const bare = collapsed.replace(/\/+$/, "");
  return `${bare}/${hash}`;
};

const canonicalInternalLinks = (): Transformer<Root> => (tree) => {
  visit(tree, "element", (node) => {
    const element = node as Element;
    if (element.tagName !== "a" || typeof element.properties.href !== "string") return;
    element.properties.href = canonicalInternalHref(element.properties.href);
  });
};

export default canonicalInternalLinks;
