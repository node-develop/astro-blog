import type { Element, Root } from "hast";
import type { Transformer } from "unified";
import { visit } from "unist-util-visit";
import { CANONICAL_ORIGIN, canonicalPath, isFileLikePath } from "../seo/url-policy";

const HAS_SCHEME = /^[a-z][a-z0-9+\-.]*:/i;

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

  // Anything carrying its own scheme (javascript:, data:, ftp:, …) is left
  // alone. Same regex as remark-strip-md-suffix, so both plugins agree on
  // what counts as "not a document path".
  if (HAS_SCHEME.test(href)) return href;
  if (isFileLikePath(href)) return href;

  const hash = new URL(href, CANONICAL_ORIGIN).hash;
  const path = href.split(/[?#]/, 1)[0] ?? href;
  if (path.startsWith("/")) return `${canonicalPath(path)}${hash}`;

  const collapsed = path.replace(/\/{2,}/g, "/");
  const bare = collapsed.replace(/\/+$/, "");
  if (bare === "" || bare === ".") return href;

  // A bare "09-subagents" and an explicit "./09-subagents" are the same
  // reference to a browser: both resolve against the CURRENT page. With
  // `trailingSlash: "always"` the current page is itself a directory, so the
  // browser glues the target onto the page path and produces
  // /courses/<course>/<lesson-a>/<lesson-b>/ — exactly the 404s Search
  // Console reported. A Markdown author writing either spelling always means
  // the sibling document, so both are normalized to the same `../<target>/`.
  const siblingRelative =
    bare === ".." || bare.startsWith("../") ? bare : `../${bare.replace(/^\.\//, "")}`;
  return `${siblingRelative}/${hash}`;
};

const canonicalInternalLinks = (): Transformer<Root> => (tree) => {
  visit(tree, "element", (node) => {
    const element = node as Element;
    if (element.tagName !== "a" || typeof element.properties.href !== "string") return;
    element.properties.href = canonicalInternalHref(element.properties.href);
  });
};

export default canonicalInternalLinks;
