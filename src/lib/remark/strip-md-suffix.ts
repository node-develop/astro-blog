import { visit } from "unist-util-visit";
import type { Plugin } from "unified";
import type { Root, Link, Definition } from "mdast";

const isInternalMdLink = (url: string): boolean => {
  if (/^https?:\/\//i.test(url)) return false;
  if (/^[a-z][a-z0-9+\-.]*:/i.test(url) && !url.startsWith("/")) return false;
  return /\.md(#[^?]*)?$/.test(url);
};

const stripMdSuffix = (url: string): string => url.replace(/\.md(?=$|#)/, "");

const remarkStripMdSuffix: Plugin<[], Root> = () => (tree) => {
  visit(tree, "link", (node: Link) => {
    if (isInternalMdLink(node.url)) node.url = stripMdSuffix(node.url);
  });
  visit(tree, "definition", (node: Definition) => {
    if (isInternalMdLink(node.url)) node.url = stripMdSuffix(node.url);
  });
};

export default remarkStripMdSuffix;
