import type { MarkdownHeading } from "astro";

export interface TocNode {
  readonly depth: 2 | 3;
  readonly text: string;
  readonly slug: string;
  readonly children: readonly TocNode[];
}

interface MutableTocNode {
  depth: 2 | 3;
  text: string;
  slug: string;
  children: MutableTocNode[];
}

const SYNTHETIC_INTRO: Readonly<Pick<MutableTocNode, "depth" | "text" | "slug">> = {
  depth: 2,
  text: "Introduction",
  slug: "__intro",
};

export function buildTocTree(headings: readonly MarkdownHeading[]): readonly TocNode[] {
  const result: MutableTocNode[] = [];
  let currentParent: MutableTocNode | null = null;

  for (const heading of headings) {
    if (heading.depth === 2) {
      const node: MutableTocNode = {
        depth: 2,
        text: heading.text,
        slug: heading.slug,
        children: [],
      };
      result.push(node);
      currentParent = node;
    } else if (heading.depth === 3) {
      if (currentParent === null) {
        currentParent = { ...SYNTHETIC_INTRO, children: [] };
        result.push(currentParent);
      }
      currentParent.children.push({
        depth: 3,
        text: heading.text,
        slug: heading.slug,
        children: [],
      });
    }
    // depth 1 and 4+ are intentionally dropped
  }

  return result;
}
