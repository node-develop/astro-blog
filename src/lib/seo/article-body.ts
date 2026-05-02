import { unified } from "unified";
import remarkParse from "remark-parse";
import { toString as mdastToString } from "mdast-util-to-string";
import { visit, SKIP } from "unist-util-visit";
import type { Root, Node } from "mdast";

export const countWords = (s: string): number => {
  const trimmed = s.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
};

export interface ExtractedBody {
  readonly text: string;
  readonly fullWordCount: number;
}

// Strips fenced code blocks, inline code, and mermaid blocks before flattening
// the remaining mdast to a plain-text excerpt. Math nodes are dropped because
// remark-math is registered for the MDX pipeline; here we run only remark-parse,
// so $...$ falls through as plain text — that is acceptable for an SEO excerpt.
export const extractArticleBody = (markdown: string, maxWords: number): ExtractedBody => {
  const tree = unified().use(remarkParse).parse(markdown) as Root;

  const isStrippable = (node: Node): boolean =>
    node.type === "code" || node.type === "inlineCode" || node.type === "html";

  visit(tree, (node, index, parent) => {
    if (parent && typeof index === "number" && isStrippable(node)) {
      (parent as { children: Node[] }).children.splice(index, 1);
      return [SKIP, index];
    }
    return undefined;
  });

  const flat = mdastToString(tree, { includeImageAlt: false }).replace(/\s+/g, " ").trim();
  const allWords = flat.length > 0 ? flat.split(/\s+/) : [];
  const fullWordCount = allWords.length;

  if (allWords.length <= maxWords) {
    return { text: flat, fullWordCount };
  }
  const truncated = allWords.slice(0, maxWords).join(" ");
  return { text: `${truncated}…`, fullWordCount };
};
